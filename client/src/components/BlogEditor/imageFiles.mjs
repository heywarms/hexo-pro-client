// Keep the blog path in Markdown; only the editor preview uses a temporary URL.
export function getUploadedImageUrl(result, storageType) {
    if (result.code && result.code !== 200) throw new Error(result.msg || '图片上传失败')
    const url = storageType === 'local'
        ? result.path || result.src || result.url
        : result.url || result.src || result.path
    if (typeof url !== 'string' || !url.trim()) throw new Error('图片上传后未返回地址')
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(url)) return url
    // Encode filenames without encoding directory separators or existing escapes.
    return encodeURI(url).replace(/%25([\da-f]{2})/gi, '%$1').replace(/#/g, '%23').replace(/\?/g, '%3F')
}

export function createLocalImageResolver(service, objectUrls = URL) {
    const cache = new Map()
    const activeUrls = new Set()
    let generation = 0

    return {
        resolve(url) {
            if (!url || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(url)) return Promise.resolve(url)
            if (cache.has(url)) return cache.get(url)
            const currentGeneration = generation
            const pending = service.get('/hexopro/api/images/file', {
                params: { path: url }, responseType: 'blob',
            }).then(response => {
                if (!response.data?.type?.startsWith('image/')) throw new Error('图片读取失败：服务器未返回图片内容')
                const previewUrl = objectUrls.createObjectURL(response.data)
                if (generation !== currentGeneration) {
                    objectUrls.revokeObjectURL(previewUrl)
                    return ''
                }
                activeUrls.add(previewUrl)
                return previewUrl
            }).catch(error => {
                if (cache.get(url) === pending) cache.delete(url)
                throw error
            })
            cache.set(url, pending)
            return pending
        },
        dispose() {
            generation++
            activeUrls.forEach(url => objectUrls.revokeObjectURL(url))
            activeUrls.clear()
            cache.clear()
        },
    }
}
