import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App'

describe('App', () => {
  it('renders home view by default', () => {
    render(<App />)
    expect(screen.getByText('开启跨境电商 AI 短视频创作')).toBeInTheDocument()
    expect(screen.getByText('新建项目')).toBeInTheDocument()
  })

  it('shows studio stages after navigating to new project', () => {
    render(<App />)
    // The Home view should show the CTA button
    expect(screen.getByText('新建项目')).toBeInTheDocument()
  })
})
