import { documentRouteId } from '@/utils/documentIdentity'
import React, { useEffect, useRef, useState } from 'react'
import service from '@/utils/api'
import { Link } from 'react-router-dom'
import _ from 'lodash'
// import { GlobalState } from '@/store';
import { message } from 'antd'
import useLocale from '@/hooks/useLocale'
import ArticleList from '../components/ArticleList/ArticleList'


interface DataType {
    key: string;
    _id: string;
    cover: string;
    title: string;
    permalink: string;
    date: string;
    updated: string;
    option: string
}


export default function Pages() {
    // const userInfo = useSelector((state: GlobalState) => state.posts);
    const inputRef = useRef(null)
    const [pageList, setPageList] = useState([])
    const t = useLocale()
    const [currentPage, setCurrentPage] = useState(1)

    const handleTableChange = (pagination) => {
        setCurrentPage(pagination.current)
    }

    const removeSource = async (item) => {
        try {
            // 执行删除操作
            await service.get('/hexopro/api/pages/' + documentRouteId(item) + '/remove')

            // 重新查询数据并更新列表
            const res = await service.get('/hexopro/api/pages/list?deleted=' + false)
            const result = res.data.map((obj, i) => {
                return { _id: obj._id, documentId: obj.documentId, title: obj.title, cover: obj.cover, date: obj.date, permalink: obj.permalink, updated: obj.updated, key: i + 1 }
            })

            // 更新列表
            setPageList(result)

            // 保持当前页码
            setCurrentPage(currentPage)
        } catch (err) {
            message.error(err.message)
        }
    }

    const queryPages = () => {
        service.get('/hexopro/api/pages/list?deleted=' + false)
            .then(res => {
                const result = res.data.data.map((obj, i) => {
                    return { _id: obj._id, documentId: obj.documentId, title: obj.title, cover: obj.cover, date: obj.date, permalink: obj.permalink, updated: obj.updated, key: i + 1 }
                })
                setPageList(result)
            })
    }

    useEffect(() => {
        queryPages()
        return () => {
            // 在组件卸载时执行清理操作，取消异步任务等
        }
    }, [])

    return (
        <div>
            <ArticleList
                published={false}
                isPage={true}
                showPublishStatus={false}
            />
        </div>

    )

}