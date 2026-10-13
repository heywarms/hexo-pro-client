import React from 'react'
import ReactDOM from 'react-dom/client'
import MobileApp from './App'

class AppBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
    state = { failed: false }
    static getDerivedStateFromError() { return { failed: true } }
    render() {
        return this.state.failed ? <main className="loading-screen"><h1>暂时无法打开写作空间</h1><p>本地文章仍然保留，请重新打开 App。</p>
            <button onClick={() => location.reload()}>重新打开</button></main> : this.props.children
    }
}

ReactDOM.createRoot(document.getElementById('app')).render(<AppBoundary><MobileApp /></AppBoundary>)
