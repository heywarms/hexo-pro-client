import React, { useState } from "react"
import { TagAdder } from "./tagAdder"
import { FrontMatterAdder } from "../../components/frontMatterAdder"
import { Button, Col, Modal, Row, Space, Tag, Tooltip } from "antd"
import { formatFrontMatterValue } from "@/utils/booleanUtils"
import useLocale from "@/hooks/useLocale"


export function PostSettings({ visible, setVisible, tagCatMeta, setTagCatMeta, postMeta, setPostMeta, handleChange }) {
    // 添加标签使用的状态
    const [tagOpenStat, setTagOpenStat] = useState(false)
    const [originTags, setOriginTags] = useState([])
    const [catOpenStat, setCatOpenStat] = useState(false)
    const [originCats, setOriginCats] = useState([])
    const [fmOpenStat, setFmOpenStat] = useState(false)
    const [originFms, setOriginFms] = useState({})
    const [frontMatterStyles, setFrontMatterStyles] = useState({})
    const [originFmStyles, setOriginFmStyles] = useState({})

    const t = useLocale()
    // console.log(postMeta)

    const tagClose = (v) => {
        const newTags = postMeta.tags.filter(item => item !== v)
        const meta = { ...postMeta, tags: newTags }
        setPostMeta(meta)
    }

    const catClose = (v) => {
        const newCats = postMeta.categories.filter(item => item !== v)
        const meta = { ...postMeta, categories: newCats }
        setPostMeta(meta)
    }

    const fmtClose = (v) => {
        const newfmt = {}
        const newStyles = { ...frontMatterStyles }
        Object.keys(postMeta.frontMatter).forEach(key => {
            if (key === v) {
                return
            }
            // 保持原始值，不进行自动转换
            console.log(key, postMeta.frontMatter[key])
            newfmt[key] = postMeta.frontMatter[key]
        })
        delete newStyles[v]
        const meta = { ...postMeta, frontMatter: newfmt }
        console.log(meta)
        setPostMeta(meta)
        setFrontMatterStyles(newStyles)
    }

    return (
        <Modal
            title={
                <div style={{ textAlign: 'left' }}>
                    {t['pageSettings.articleSettings']}
                </div>
            }
            open={visible}
            onCancel={() => {
                setVisible(false)
                console.log('cancel', originFms)
                setPostMeta({ ...postMeta, tags: originTags, categories: originCats, frontMatter: originFms })
                setFrontMatterStyles(originFmStyles)
            }}
            onOk={async () => {
                await handleChange({
                    tags: postMeta.tags,
                    categories: postMeta.categories,
                    frontMatter: postMeta.frontMatter,
                    frontMatterStyles
                })
                setVisible(false)
            }}
            afterOpenChange={() => {
                setOriginTags(postMeta.tags)
                setOriginCats(postMeta.categories)
                setOriginFms(postMeta.frontMatter)
                setOriginFmStyles(frontMatterStyles)
            }}
            style={{ width: 800 }}
        >
            <Row style={{ width: '100%' }}>
                <Col>
                </Col>
                <Col style={{ width: '100%' }}>
                    <Space style={{ width: '100%', flexWrap: 'wrap' }}>
                        {
                            // 循环填充当前已有的标签
                            postMeta.tags.map((item) => {
                                return <Tag key={item} closable onClose={() => tagClose(item)} color="blue" style={{ marginBottom: 5 }}>{item}</Tag>
                            })
                        }
                        <Button type='dashed' onClick={() => {
                            setTagOpenStat(!tagOpenStat)
                            setCatOpenStat(false)
                            setFmOpenStat(false)
                        }}>{t['pageSettings.addTag']}</Button>
                    </Space>
                    {/* todo 打开添加标签的界面 */}
                    {
                        <TagAdder existTags={tagCatMeta.tags} tags={postMeta.tags} onchange={(v) => {
                            const meta = { ...postMeta, tags: v }
                            console.log(v)
                            setPostMeta(meta)
                        }} visible={tagOpenStat} cardTitle={'标签'} placeholder={'请输入标签...'} onClose={() => setTagOpenStat(false)} />
                    }
                </Col>
            </Row>
            <Row style={{ width: '100%', marginTop: 15, marginBottom: 15 }}>
                <Col style={{ width: '100%' }}>
                    <Space style={{ width: '100', flexWrap: 'wrap' }}>
                        {
                            postMeta.categories.map((item) => {
                                return <Tag key={item} color="blue" style={{ marginBottom: 5 }} closable onClose={() => catClose(item)}>{item}</Tag>
                            })
                        }
                        <Button type='dashed' onClick={() => {
                            setCatOpenStat(!catOpenStat)
                            setFmOpenStat(false)
                            setTagOpenStat(false)
                        }}>{t['pageSettings.addCategory']}</Button>
                    </Space>
                    {
                        /* todo 打开添加标签的界面 */
                        <TagAdder existTags={tagCatMeta.categories} tags={postMeta.categories} onchange={(v) => {
                            const meta = { ...postMeta, categories: v }
                            setPostMeta(meta)
                        }} visible={catOpenStat} cardTitle={'分类'} placeholder={'请输入分类...'} onClose={() => setCatOpenStat(false)} />
                    }
                </Col>
            </Row>
            <Row style={{ marginTop: 15, marginBottom: 15 }}>
                <Col>
                    <Space style={{ width: '100', flexWrap: 'wrap' }}>
                        {
                            /* 遍历渲染已有的fontMatter */
                            Object.keys(postMeta.frontMatter).map((item) => {
                                return (
                                    <Tooltip key={item} title={formatFrontMatterValue(postMeta.frontMatter[item])}>
                                        <Tag closable onClose={() => fmtClose(item)} key={item} color="blue" style={{ marginBottom: 5 }}>{item}</Tag>
                                    </Tooltip>
                                )
                            })
                        }
                        <Button type='dashed'
                            onClick={() => {
                                setFmOpenStat(!fmOpenStat)
                                setTagOpenStat(false)
                                setCatOpenStat(false)
                            }}
                        >{t['pageSettings.addFrontMatter']}</Button>
                    </Space>
                    {
                        /* todo 打开添加标签的界面 */
                        <FrontMatterAdder
                            existFrontMatter={originFms}
                            onClose={() => { setFmOpenStat(false) }}
                            visible={fmOpenStat}
                            title={'Font-Matter'}
                            frontMatter={postMeta.frontMatter}
                            frontMatterStyles={frontMatterStyles}
                            onChange={
                            (v, styles) => {
                                // 直接使用用户选择的值，不进行自动转换
                                const meta = { ...postMeta, frontMatter: v }
                                setPostMeta(meta)
                                setFrontMatterStyles(styles || {})
                            }
                        } />
                    }
                </Col>
            </Row>
        </Modal>
    )
}
