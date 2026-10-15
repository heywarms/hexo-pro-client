import React, { useContext } from 'react'
import { GlobalContext } from '@/context'
import useLocale from '@/hooks/useLocale'
import locale from './locale'
import styles from './style.module.less'

type Props = {
  title: string
  description: string
  count?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
  sectionTitle?: string
}

export default function ManagementPage({ title, description, count, actions, children, className = '', sectionTitle }: Props) {
  const { theme } = useContext(GlobalContext)
  const ui = useLocale(locale)
  return <section className={`${styles.page} ${className}`} data-theme={theme}>
    <div className={styles.breadcrumb}>{sectionTitle || ui.content}<span>/</span><span>{title}</span></div>
    <header className={styles.header}>
      <div className={styles.heading}>
        <div className={styles.titleLine}><h1>{title}</h1>{count !== undefined && <span className={styles.count}>{count}</span>}</div>
        <p>{description}</p>
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
    {children}
  </section>
}
