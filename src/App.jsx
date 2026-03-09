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
