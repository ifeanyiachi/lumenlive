export type MediaType = "image" | "video" | "audio"

export interface MediaAsset {
  id: string
  name: string
  type: MediaType
  filePath: string
  thumbnailDataUrl?: string
  width?: number
  height?: number
  duration?: number
  fileSize: number
  tags: string[]
  addedAt: number
  /**
   * True when the file was copied into the app-managed media library folder
   * (import mode "copy"). Managed files are owned by the app: they are deleted
   * from disk when the asset is removed from the library. Referenced assets
   * (the default) leave this undefined and never touch the original file.
   */
  managed?: boolean
}

export interface Collection {
  id: string
  name: string
  assetIds: string[]
  createdAt: number
}

export interface MediaFileInfo {
  path: string
  name: string
  size: number
  mediaType: MediaType
  width?: number
  height?: number
}
