import { useState, useEffect } from 'react'
import NDK from '@nostr-dev-kit/ndk'

/**
 * useBlossom - Hook for handling Blossom blob fetching
 * 
 * Blossom is a protocol for decentralized file storage on Nostr (NIP-B7)
 * 
 * @param {NDK} ndk - NDK instance
 */
export function useBlossom(ndk) {
  const [blossomServers, setBlossomServers] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  /**
   * Fetch user's Blossom server list (Kind 10063)
   */
  const fetchBlossomServers = async (pubkey) => {
    if (!pubkey) return []
    
    setLoading(true)
    setError(null)
    
    try {
      await ndk.connect()
      
      const servers = []
      const subscription = ndk.subscribe({
        kinds: [10063],
        authors: [pubkey],
        limit: 1
      }, { closeOnEose: true })
      
      return new Promise((resolve) => {
        subscription.on('event', (event) => {
          const content = JSON.parse(event.content)
          if (Array.isArray(content)) {
            servers.push(...content)
          }
        })
        
        subscription.on('eose', () => {
          setBlossomServers(servers)
          setLoading(false)
          resolve(servers)
        })
        
        setTimeout(() => {
          subscription.close()
          setLoading(false)
          // Return default servers if no list found
          const defaults = [
            'https://blossom.digital',
            'https://nos.lol',
            'https://nostr.band'
          ]
          setBlossomServers(defaults)
          resolve(defaults)
        }, 5000)
      })
    } catch (e) {
      setError(e.message)
      setLoading(false)
      return []
    }
  }

  /**
   * Get SHA-256 hash from Kind 9420 event
   * The hash is in the "x" tag of the event
   */
  const getFileHash = (fileEvent) => {
    if (!fileEvent) return null
    
    // Look for the x tag which contains the SHA-256 hash
    const xTag = fileEvent.tags.find(t => t[0] === 'x')
    if (xTag && xTag[1]) {
      return xTag[1]
    }
    
    // Alternative: look in content
    try {
      const content = JSON.parse(fileEvent.content)
      if (content?.sha256) {
        return content.sha256
      }
    } catch (e) {
      // Not JSON content
    }
    
    return null
  }

  /**
   * Get the Blossom URL for a file
   * Uses the SHA-256 hash to locate the blob
   */
  const getBlossomUrl = async (fileEvent, preferredServer = null) => {
    const hash = getFileHash(fileEvent)
    if (!hash) {
      throw new Error('No file hash found in metadata')
    }
    
    // Get list of servers to try
    let servers = blossomServers
    if (servers.length === 0) {
      servers = await fetchBlossomServers(fileEvent.pubkey)
    }
    
    if (preferredServer) {
      servers = [preferredServer, ...servers]
    }
    
    // Try each server until we find the file
    for (const server of servers) {
      const url = `${server.replace(/\/$/, '')}/${hash}`
      
      try {
        // Check if file exists (HEAD request)
        const response = await fetch(url, { method: 'HEAD' })
        if (response.ok) {
          return url
        }
      } catch (e) {
        // Server doesn't have this file, try next
        continue
      }
    }
    
    throw new Error('File not found on any Blossom server')
  }

  /**
   * Check if a Blossom server requires authentication (Kind 24242)
   */
  const isBlossomServerPrivate = async (serverUrl) => {
    try {
      const response = await fetch(serverUrl)
      // If we get a 401 or similar, it's private
      return response.status === 401 || response.status === 403
    } catch (e) {
      return false
    }
  }

  /**
   * Fetch blob with authorization (for private servers)
   * Signs a Kind 24242 event for authentication
   */
  const fetchAuthorizedBlob = async (url, pubkey, privateKey) => {
    // Create Kind 24242 auth event
    const authEvent = {
      kind: 24242,
      created_at: Math.floor(Date.now() / 1000),
      pubkey: pubkey,
      tags: [['u', url], ['d', new URL(url).hostname]],
      content: 'Blossom authorization'
    }
    
    // Note: In a real implementation, you'd sign this with the private key
    // and include it in the request headers
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Nostr ${btoa(JSON.stringify(authEvent))}`
      }
    })
    
    if (!response.ok) {
      throw new Error('Failed to fetch blob with authorization')
    }
    
    return response.blob()
  }

  /**
   * Fetch blob metadata from Kind 9420 event
   */
  const fetchBlobMetadata = async (noteIdOrEvent) => {
    setLoading(true)
    setError(null)
    
    try {
      await ndk.connect()
      
      let event
      
      // If it's already an event object
      if (typeof noteIdOrEvent === 'object' && noteIdOrEvent.kind === 9420) {
        event = noteIdOrEvent
      } else {
        // Fetch by note ID
        event = await ndk.fetchEvent(noteIdOrEvent, {
          kinds: [9420],
          cacheFirst: false
        })
      }
      
      if (!event) {
        throw new Error('Blob metadata not found')
      }
      
      // Parse metadata from event
      const metadata = {
        event,
        hash: getFileHash(event),
        pubkey: event.pubkey,
        createdAt: event.created_at,
        // Extract other relevant tags
        mimeType: event.tags.find(t => t[0] === 'm')?.[1],
        size: event.tags.find(t => t[0] === 'size')?.[1],
        blurhash: event.tags.find(t => t[0] === 'blurhash')?.[1],
        url: event.tags.find(t => t[0] === 'url')?.[1]
      }
      
      setLoading(false)
      return metadata
    } catch (e) {
      setError(e.message)
      setLoading(false)
      return null
    }
  }

  return {
    blossomServers,
    loading,
    error,
    fetchBlossomServers,
    getFileHash,
    getBlossomUrl,
    isBlossomServerPrivate,
    fetchAuthorizedBlob,
    fetchBlobMetadata
  }
}
