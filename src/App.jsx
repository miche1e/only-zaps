import { useState, useEffect } from 'react'
import NDK from '@nostr-dev-kit/ndk'
import { useBlossom } from './hooks/useBlossom'

// Initialize NDK
const ndk = new NDK({
  explicitRelayUrls: [
    'wss://relay.nostr.band',
    'wss://relay.damus.io',
    'wss://nos.lol'
  ]
})

function App() {
  const [nwcUri, setNwcUri] = useState('')
  const [noteId, setNoteId] = useState('')
  const [fileMetadata, setFileMetadata] = useState(null)
  const [status, setStatus] = useState('idle') // idle, fetching, locked, paying, verifying, unlocked, error
  const [error, setError] = useState('')
  const [blossomUrl, setBlossomUrl] = useState('')
  const [zapAmount, setZapAmount] = useState(1000) // sats
  const [uploadFile, setUploadFile] = useState(null)
  const [uploadStatus, setUploadStatus] = useState('idle') // idle, uploading, done, error
  const [uploadHash, setUploadHash] = useState('')
  const [uploadError, setUploadError] = useState('')

  const { fetchBlobMetadata, getBlossomUrl, isBlossomServerPrivate } = useBlossom(ndk)

  // Parse NWC URI
  const parseNwcUri = (uri) => {
    try {
      const url = new URL(uri)
      const params = new URLSearchParams(url.search)
      return {
        relay: url.hostname,
        pubkey: url.pathname.slice(1),
        secret: params.get('secret')
      }
    } catch (e) {
      throw new Error('Invalid NWC URI format')
    }
  }

  // Fetch file metadata (Kind 9420)
  const fetchFileMetadata = async () => {
    if (!noteId) return

    setStatus('fetching')
    setError('')

    try {
      await ndk.connect()

      const event = await ndk.fetchEvent(noteId, {
        kinds: [9420],
        cacheFirst: false
      })

      if (!event) {
        throw new Error('File metadata not found')
      }

      setFileMetadata(event)
      setStatus('locked')
    } catch (e) {
      setError(e.message)
      setStatus('error')
    }
  }

  // Initiate zap payment
  const initiateZap = async () => {
    if (!fileMetadata || !nwcUri) return

    setStatus('paying')
    setError('')

    try {
      const nwc = parseNwcUri(nwcUri)

      // Create zap request
      const zapRequest = {
        pubkey: fileMetadata.pubkey,
        amount: zapAmount * 1000, // convert to msats
        comment: 'Zap to unlock file'
      }

      // Note: In a real implementation, you'd use @nostr-dev-kit/ndk-nwc
      // or similar to send the zap. This is a simplified flow.

      // For now, simulate the payment flow
      setStatus('verifying')

      // Wait for zap receipt (Kind 9735)
      await waitForZapReceipt(fileMetadata.pubkey)

    } catch (e) {
      setError(e.message)
      setStatus('error')
    }
  }

  // Wait for zap receipt
  const waitForZapReceipt = async (pubkey) => {
    // Subscribe to zap receipts
    const subscription = ndk.subscribe({
      kinds: [9735],
      '#p': [pubkey],
      limit: 1
    }, { closeOnEose: true })

    return new Promise((resolve, reject) => {
      subscription.on('event', async (event) => {
        const zap = event

        // Verify zap is for our amount
        const invoice = zap.tags.find(t => t[0] === 'bolt11')
        if (invoice) {
          setStatus('unlocked')

          // Get Blossom URL
          if (fileMetadata) {
            const url = await getBlossomUrl(fileMetadata)
            setBlossomUrl(url)
          }

          resolve()
        }
      })

      // Timeout after 30 seconds
      setTimeout(() => {
        subscription.close()
        reject(new Error('Zap receipt timeout'))
      }, 30000)
    })
  }

  // Compute SHA-256 hash of a File as hex string
  const sha256Hex = async (file) => {
    const buf = await file.arrayBuffer()
    const hashBuffer = await crypto.subtle.digest('SHA-256', buf)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  }

  // Upload file to Blossom with Nostr auth (Kind 24242)
  const uploadToBlossom = async () => {
    if (!uploadFile) return

    if (!window.nostr || typeof window.nostr.signEvent !== 'function') {
      setUploadError('No Nostr extension found. Install a Nostr browser extension (e.g. Alby) and try again.')
      return
    }

    setUploadStatus('uploading')
    setUploadError('')
    setUploadHash('')

    try {
      const fileSha256 = await sha256Hex(uploadFile)
      console.log('[only-zaps] uploadToBlossom sha256:', fileSha256)

      const pubkey = await window.nostr.getPublicKey(); // 'npub182mtcnta6tskx9mhx639j2nrelhu5pz0gwjc6n5l73kgw3jdlt3s63semj' // npub1ulzey4scrkvy95j4nzfguzqujvwpyw6asfvh8pezxau2mp3ct3vq76gclz' // await window.nostr.getPublicKey()
      console.log('[only-zaps] uploadToBlossom pubkey from nostr:', pubkey)

      const now = Math.floor(Date.now() / 1000)
      const unsignedEvent = {
        kind: 24242,
        pubkey,
        created_at: now,
        tags: [
          ['t', 'upload'],
          ['x', fileSha256],
          ['u', 'https://blossom.nostruggle.app/upload'],
          ['method', 'PUT'],
          ['expiration', String(now + 300)]
        ],
        content: ''
      }

      const signedEvent = await window.nostr.signEvent(unsignedEvent)
      const authHeader = 'Nostr ' + btoa(JSON.stringify(signedEvent))

      const response = await fetch('https://blossom.nostruggle.app/upload', {
        method: 'PUT',
        headers: {
          Authorization: authHeader,
          'X-SHA-256': fileSha256
        },
        body: uploadFile
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || `Upload failed with status ${response.status}`)
      }

      const result = await response.json()
      if (!result.sha256) {
        throw new Error('Upload succeeded but no sha256 returned from Blossom')
      }

      setUploadHash(result.sha256)
      setUploadStatus('done')
    } catch (e) {
      setUploadStatus('error')
      setUploadError(e.message || 'Upload failed')
    }
  }

  return (
    <div className="min-h-screen bg-bg px-4 py-10 sm:px-8">
      <div className="max-w-xl mx-auto space-y-6">
        {/* Header */}
        <header className="text-center mb-4">
          <h1 className="text-3xl font-bold tracking-tight text-text-heading">
            Mike's Blossom Client
          </h1>
          <p className="text-sm text-text-muted mt-1">Upload &amp; manage files on Blossom</p>
        </header>

        {/* Upload to Blossom */}
        <section className="card">
          <h2 className="text-lg font-semibold text-text-heading mb-1">Upload to Blossom</h2>
          <p className="text-sm text-text-muted mb-5">
            Select a photo and upload it to blossom.nostruggle.app using your Nostr browser extension.
          </p>
          <div className="flex flex-col gap-3">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0] || null
                setUploadFile(file)
                setUploadHash('')
                setUploadError('')
                setUploadStatus('idle')
              }}
              className="text-sm text-text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white file:cursor-pointer hover:file:bg-accent-hover"
            />
            <button
              onClick={uploadToBlossom}
              disabled={!uploadFile || uploadStatus === 'uploading'}
              className="btn-primary self-start"
            >
              {uploadStatus === 'uploading' ? 'Uploading…' : 'Upload'}
            </button>
          </div>

          {uploadHash && (
            <div className="mt-5 rounded-lg bg-bg p-4 text-sm break-all space-y-1.5">
              <p className="text-success font-medium">Upload successful</p>
              <p className="text-text-muted">
                <span className="text-text">SHA-256:</span> {uploadHash}
              </p>
              <a
                href={`https://blossom.nostruggle.app/${uploadHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-link hover:underline"
              >
                View on Blossom &rarr;
              </a>
            </div>
          )}

          {uploadError && (
            <div className="mt-4 rounded-lg bg-error/10 border border-error/30 p-3 text-sm text-error">
              {uploadError}
            </div>
          )}
        </section>

        {/* File Lookup */}
        <section className="card">
          <h2 className="text-lg font-semibold text-text-heading mb-3">File Lookup</h2>
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Note ID (npub or note…)"
              value={noteId}
              onChange={(e) => setNoteId(e.target.value)}
              className="input-field flex-1"
            />
            <button
              onClick={fetchFileMetadata}
              disabled={status === 'fetching'}
              className="btn-primary whitespace-nowrap"
            >
              {status === 'fetching' ? 'Fetching…' : 'Fetch'}
            </button>
          </div>
        </section>

        {/* File Preview / Locked State */}
        {fileMetadata && (
          <section className="card">
            <h2 className="text-lg font-semibold text-text-heading mb-4">Preview</h2>

            {status === 'locked' && (
              <div className="text-center">
                <div className="locked-preview rounded-xl bg-bg p-10 mb-5">
                  <div className="text-5xl mb-3 opacity-60">🔒</div>
                  <p className="text-text-muted font-medium">Content Locked</p>
                </div>

                <div className="mb-5">
                  <label className="block text-sm text-text-muted mb-2">
                    Unlock Amount: <span className="text-accent font-semibold">{zapAmount} sats</span>
                  </label>
                  <input
                    type="range"
                    min="100"
                    max="10000"
                    step="100"
                    value={zapAmount}
                    onChange={(e) => setZapAmount(Number(e.target.value))}
                    className="w-full accent-accent"
                  />
                </div>

                <button
                  onClick={initiateZap}
                  disabled={status === 'paying'}
                  className="btn-primary"
                >
                  {status === 'paying' ? 'Processing…' : `Unlock for ${zapAmount} sats`}
                </button>
              </div>
            )}

            {status === 'paying' && (
              <div className="text-center py-8">
                <div className="animate-pulse text-warning text-lg font-medium">
                  Sending Zap…
                </div>
              </div>
            )}

            {status === 'verifying' && (
              <div className="text-center py-8">
                <div className="animate-pulse text-success text-lg font-medium">
                  Verifying Payment…
                </div>
              </div>
            )}

            {status === 'unlocked' && blossomUrl && (
              <div className="text-center py-4">
                <div className="text-success text-3xl mb-2">&#10003;</div>
                <p className="text-success font-medium mb-5">Content Unlocked</p>
                <a
                  href={blossomUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary inline-block"
                >
                  View File
                </a>
              </div>
            )}
          </section>
        )}

        {/* Error Display */}
        {error && (
          <div className="rounded-lg bg-error/10 border border-error/30 p-4 text-sm text-error">
            {error}
          </div>
        )}

        {/* Footer */}
        <footer className="pt-4 text-center text-text-muted text-xs">
          <p>Powered by Nostr &middot; NIP-47 + NIP-B7</p>
        </footer>
      </div>
    </div>
  )
}

export default App
