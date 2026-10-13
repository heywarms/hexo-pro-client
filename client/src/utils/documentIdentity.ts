import { base64Encode } from './encodeUtils'

type DocumentReference = { documentId?: string | null; permalink?: string | null }

export function documentReference(document: DocumentReference): string {
    return document.documentId || base64Encode(document.permalink || '')
}

export function documentRouteId(document: DocumentReference): string {
    return encodeURIComponent(documentReference(document))
}
