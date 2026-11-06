/** A saved web/browser bookmark (a page or a YouTube video). */
export interface WebBookmark {
  id: string
  url: string
  label: string
  isYouTube: boolean
  videoId?: string
  createdAt: number
}
