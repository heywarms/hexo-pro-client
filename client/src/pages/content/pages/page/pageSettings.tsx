import React, { useState } from "react"
import { Button, Col, Input, message, Modal, Row, Space, Tag, Tooltip } from "antd"
import { FrontMatterAdder } from "../../components/frontMatterAdder"
import { formatFrontMatterValue } from "@/utils/booleanUtils"
import useLocale from "@/hooks/useLocale"

export function PageSettings({ visible, setVisible, pageMeta, setPageMeta, handleChange }) {
    // 添加使用的状态
    const [fmOpenStat, setFmOpenStat] = useState(false)
    const [originFms, setOriginFms] = useState({})
    const [frontMatterStyles, setFrontMatterStyles] = useState({})
    const [originFmStyles, setOriginFmStyles] = useState({})

    const t = useLocale()

    const fmtClose = (v) => {
        const newfmt = {}
        const newStyles = { ...frontMatterStyles }
        Object.keys(pageMeta.frontMatter).forEach(key => {
            if (key === v) {
                return
            }
            // 保持原始值，不进行自动转换
            newfmt[key] = pageMeta.frontMatter[key]
        })
        delete newStyles[v]
        const meta = { ...pageMeta, frontMatter: newfmt }
        setPageMeta(meta)
        setFrontMatterStyles(newStyles)
    }

    function isPathValid(path) {
        // 匹配以.md为扩展名的文件名，并且路径只包含合法字符（字母、数字、斜杠、下划线、短横线和中文字符）
        const regex = /^([\u4e00-\u9fa5a-zA-Z0-9-_\/]+)\/([\u4e00-\u9fa5a-zA-Z0-9-_]+\.md)$/i
        return regex.test(path)
    }

    return (
        <Modal
            title={
                <div style={{ textAlign: 'left' }}>
                    {t['pageSettings.articleSettings']}
                </div>
            }
            visible={visible}
            onCancel={() => {
                setPageMeta({ ...pageMeta, tags: [], categories: [], frontMatter: originFms })
                setFrontMatterStyles(originFmStyles)
                setVisible(false)
            }}
            onOk={async () => {
                if (!isPathValid(pageMeta.source)) {
                    message.error(t['pageSettings.input.path.error'])
                } else {
                    await handleChange({ frontMatter: pageMeta.frontMatter, frontMatterStyles, source: pageMeta.source })
                    setVisible(false)
                }
            }}
            afterOpenChange={() => {
                setOriginFms(pageMeta.frontMatter)
                setOriginFmStyles(frontMatterStyles)
            }}
            style={{ width: 800 }}
        >
            <Row style={{ marginTop: 15, marginBottom: 15 }}>
                <Col>
                    <Space style={{ width: '100', flexWrap: 'wrap' }}>
                        {
                            /* 遍历渲染已有的fontMatter */
                            Object.keys(pageMeta.frontMatter).map((item) => {
                                return (
                                    <Tooltip key={item} title={formatFrontMatterValue(pageMeta.frontMatter[item])}>
                                        <Tag closable onClose={() => fmtClose(item)} key={item} color="blue" style={{ marginBottom: 5 }}>{item}</Tag>
                                    </Tooltip>

                                )
                            })
                        }
                        <Button type='dashed'
                            onClick={() => {
                                setFmOpenStat(!fmOpenStat)
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
                            frontMatter={pageMeta.frontMatter}
                            frontMatterStyles={frontMatterStyles}
                            onChange={
                            (v, styles) => {
                                // 直接使用用户选择的值，不进行自动转换
                                const meta = { ...pageMeta, frontMatter: v }
                                setPageMeta(meta)
                                setFrontMatterStyles(styles || {})
                            }
                        } />
                    }
                </Col>
            </Row>
            <Row style={{ marginTop: 15, marginBottom: 15 }}>
                <Col>
                    <Input style={{ width: 350 }}  placeholder={t['pageSettings.input.path.placeholder']} value={pageMeta.source} onChange={(v) => {
                        console.log(v.target.value)
                        console.log(pageMeta)
                        const newMeta = { ...pageMeta, source: v.target.value }
                        console.log(newMeta)
                        setPageMeta((pre)=>newMeta)
                    }} />
                </Col>
            </Row>
        </Modal>
    )
}
