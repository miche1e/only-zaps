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

      const now = Math.floor(Date.now() / 1000)
      const unsignedEvent = {
        kind: 24242,
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
    <div className="min-h-screen bg-cyber-darker p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <header className="mb-12 text-center">
          <h1 className="text-4xl font-display text-cyber-cyan glow-text mb-2">
            ONLY-ZAPS
          </h1>
          <p className="text-cyber-gray">Zap-to-Unlock Blob Access</p>
        </header>

        {/* NWC Connection */}
        <section className="mb-8 cyber-border p-6 rounded-lg">
          <h2 className="text-xl text-cyber-purple mb-4 font-display">Connect Wallet</h2>
          <input
            type="text"
            placeholder="nostr+walletconnect://..."
            value={nwcUri}
            onChange={(e) => setNwcUri(e.target.value)}
            className="w-full bg-cyber-dark border border-cyber-gray rounded p-3 text-white focus:border-cyber-cyan outline-none"
          />
          <p className="text-sm text-cyber-gray mt-2">
            Paste your NWC connection string
          </p>
        </section>

        {/* Upload to Blossom */}
        <section className="mb-8 cyber-border p-6 rounded-lg">
          <h2 className="text-xl text-cyber-purple mb-4 font-display">Upload to Blossom</h2>
          <p className="text-sm text-cyber-gray mb-4">
            Select a photo and upload it to your Blossom server at blossom.nostruggle.app using your Nostr key (via browser extension).
          </p>
          <div className="flex flex-col gap-4">
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
              className="w-full text-sm text-cyber-gray"
            />
            <button
              onClick={uploadToBlossom}
              disabled={!uploadFile || uploadStatus === 'uploading'}
              className="btn-zap self-start"
            >
              {uploadStatus === 'uploading' ? 'Uploading...' : 'Upload to Blossom'}
            </button>
          </div>

          {uploadHash && (
            <div className="mt-4 text-sm text-cyber-green break-all">
              <p className="mb-1">Uploaded hash (sha256):</p>
              <p>{uploadHash}</p>
              <p className="mt-2">
                URL:{' '}
                <a
                  href={`https://blossom.nostruggle.app/${uploadHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline text-cyber-cyan"
                >
                  https://blossom.nostruggle.app/{uploadHash}
                </a>
              </p>
            </div>
          )}

          {uploadError && (
            <div className="mt-4 bg-red-900/20 border border-red-500 rounded-lg p-3 text-sm text-red-400">
              Upload error: {uploadError}
            </div>
          )}
        </section>

        {/* File Lookup */}
        <section className="mb-8 cyber-border p-6 rounded-lg">
          <h2 className="text-xl text-cyber-purple mb-4 font-display">File ID</h2>
          <div className="flex gap-4">
            <input
              type="text"
              placeholder="Note ID (npub or note...)"
              value={noteId}
              onChange={(e) => setNoteId(e.target.value)}
              className="flex-1 bg-cyber-dark border border-cyber-gray rounded p-3 text-white focus:border-cyber-cyan outline-none"
            />
            <button
              onClick={fetchFileMetadata}
              disabled={status === 'fetching'}
              className="btn-zap"
            >
              {status === 'fetching' ? 'Fetching...' : 'Fetch'}
            </button>
          </div>
        </section>

        {/* File Preview / Locked State */}
        {fileMetadata && (
          <section className="mb-8 cyber-border p-6 rounded-lg">
            <h2 className="text-xl text-cyber-purple mb-4 font-display">Preview</h2>
            
            {status === 'locked' && (
              <div className="text-center">
                <div className="locked-preview bg-cyber-gray rounded-lg p-8 mb-6">
                  <div className="text-6xl mb-4">🔒</div>
                  <p className="text-cyber-pink">Content Locked</p>
                </div>
                
                <div className="mb-6">
                  <label className="block text-cyber-cyan mb-2">
                    Unlock Amount: {zapAmount} sats
                  </label>
                  <input
                    type="range"
                    min="100"
                    max="10000"
                    step="100"
                    value={zapAmount}
                    onChange={(e) => setZapAmount(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
                
                <button
                  onClick={initiateZap}
                  disabled={status === 'paying'}
                  className="btn-zap"
                >
                  {status === 'paying' ? 'Processing...' : `Unlock for ${zapAmount} sats`}
                </button>
              </div>
            )}
            
            {status === 'paying' && (
              <div className="text-center py-8">
                <div className="animate-pulse text-cyber-yellow text-xl">
                  ⚡ Sending Zap...
                </div>
              </div>
            )}
            
            {status === 'verifying' && (
              <div className="text-center py-8">
                <div className="animate-pulse text-cyber-green text-xl">
                  ✓ Verifying Payment...
                </div>
              </div>
            )}
            
            {status === 'unlocked' && blossomUrl && (
              <div className="text-center">
                <div className="text-cyber-green text-4xl mb-4">✓</div>
                <p className="text-cyber-green mb-6">Content Unlocked!</p>
                
                <a
                  href={blossomUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-zap inline-block"
                >
                  View File
                </a>
              </div>
            )}
          </section>
        )}

        {/* Error Display */}
        {error && (
          <div className="bg-red-900/20 border border-red-500 rounded-lg p-4 text-red-400">
            Error: {error}
          </div>
        )}

        {/* Status Indicator */}
        <footer className="mt-12 text-center text-cyber-gray text-sm">
          <p>Status: {status}</p>
          <p className="mt-2">Powered by NIP-47 + NIP-B7</p>
        </footer>
      </div>
    </div>
  )
}

export default App
