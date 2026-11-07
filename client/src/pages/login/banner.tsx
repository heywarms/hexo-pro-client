import React from 'react'
import { FileTextOutlined } from '@ant-design/icons'
import styles from './style/index.module.less'

export default function LoginBanner() {
    return <div className={styles['banner-inner']}>
        <div className={styles['banner-mark']} aria-hidden><FileTextOutlined /></div>
        <h1 className={styles['carousel-title']}>思之所及，<br />文之所至。</h1>
        <p className={styles['carousel-sub-title']}>Think it. Write it.</p>
        <div className={styles['banner-caption']}>Hexo Pro · 你的写作空间</div>
    </div>
}
