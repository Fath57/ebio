import * as FileSystem from 'expo-file-system'
import { useCallback, useState } from 'react'
import { apiFetch } from '../../../utils/api-client'

interface DownloadState {
  isDownloading: boolean
  progress: number
  localUri: string | null
  error: string | null
}

interface UseDownloadModuleReturn extends DownloadState {
  startDownload: (moduleId: string) => Promise<void>
  cancelDownload: () => void
  deleteDownload: (moduleId: string) => Promise<void>
  getLocalUri: (moduleId: string) => Promise<string | null>
}

const DOWNLOAD_DIR = `${FileSystem.documentDirectory}training-modules/`

function getLocalPath(moduleId: string): string {
  return `${DOWNLOAD_DIR}${moduleId}`
}

export function useDownloadModule(): UseDownloadModuleReturn {
  const [state, setState] = useState<DownloadState>({
    isDownloading: false,
    progress: 0,
    localUri: null,
    error: null,
  })

  const [downloadResumable, setDownloadResumable]
    = useState<FileSystem.DownloadResumable | null>(null)

  const ensureDirectory = useCallback(async (): Promise<void> => {
    const dirInfo = await FileSystem.getInfoAsync(DOWNLOAD_DIR)
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(DOWNLOAD_DIR, { intermediates: true })
    }
  }, [])

  const startDownload = useCallback(
    async (moduleId: string): Promise<void> => {
      setState({ isDownloading: true, progress: 0, localUri: null, error: null })

      try {
        await ensureDirectory()

        // Get signed download URL from the API
        const res = await apiFetch(`/api/training/modules/${moduleId}/download`)
        if (!res.ok) {
          throw new Error('Impossible de recuperer le lien de telechargement')
        }

        const { url } = await res.json()
        const localPath = getLocalPath(moduleId)

        const callback = (downloadProgress: FileSystem.DownloadProgressData) => {
          const progress
            = downloadProgress.totalBytesExpectedToWrite > 0
              ? downloadProgress.totalBytesWritten
              / downloadProgress.totalBytesExpectedToWrite
              : 0
          setState(prev => ({ ...prev, progress }))
        }

        const resumable = FileSystem.createDownloadResumable(
          url,
          localPath,
          {},
          callback,
        )
        setDownloadResumable(resumable)

        const result = await resumable.downloadAsync()

        if (result?.uri) {
          setState({
            isDownloading: false,
            progress: 1,
            localUri: result.uri,
            error: null,
          })
        }
        else {
          throw new Error('Telechargement annule')
        }
      }
      catch (err) {
        setState(prev => ({
          ...prev,
          isDownloading: false,
          error: err instanceof Error ? err.message : 'Erreur de telechargement',
        }))
      }
      finally {
        setDownloadResumable(null)
      }
    },
    [ensureDirectory],
  )

  const cancelDownload = useCallback((): void => {
    if (downloadResumable) {
      downloadResumable.pauseAsync()
      setDownloadResumable(null)
      setState(prev => ({
        ...prev,
        isDownloading: false,
        error: 'Telechargement annule',
      }))
    }
  }, [downloadResumable])

  const deleteDownload = useCallback(
    async (moduleId: string): Promise<void> => {
      const localPath = getLocalPath(moduleId)
      const fileInfo = await FileSystem.getInfoAsync(localPath)
      if (fileInfo.exists) {
        await FileSystem.deleteAsync(localPath)
      }
      setState({ isDownloading: false, progress: 0, localUri: null, error: null })
    },
    [],
  )

  const getLocalUri = useCallback(
    async (moduleId: string): Promise<string | null> => {
      const localPath = getLocalPath(moduleId)
      const fileInfo = await FileSystem.getInfoAsync(localPath)
      return fileInfo.exists ? localPath : null
    },
    [],
  )

  return {
    ...state,
    startDownload,
    cancelDownload,
    deleteDownload,
    getLocalUri,
  }
}
