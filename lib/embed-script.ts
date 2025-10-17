type EmbedScriptOptions = {
  slug?: string
  accent?: string
  label?: string
  origin?: string
  position?: 'bottom-right' | 'bottom-left'
}

const DEFAULTS = {
  accent: '#f97316',
  label: 'Spørg Lejechat',
  position: 'bottom-right' as const,
}

export const buildEmbedScript = ({ slug, accent, label, origin, position }: EmbedScriptOptions = {}): string => {
  const safeSlug = slug || ''
  const accentColor = accent || DEFAULTS.accent
  const launcherLabel = label || DEFAULTS.label
  const originHint = origin || ''
  const launcherPosition = position || DEFAULTS.position

  const cssBlock = `
      #lejechat-widget-container {
        position: fixed;
        bottom: 20px;
        right: 20px;
        left: auto;
        z-index: 2147483647;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 12px;
        font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      #lejechat-widget-frame {
        width: 360px;
        max-width: calc(100vw - 32px);
        height: 520px;
        border: 1px solid rgba(15, 23, 42, 0.1);
        border-radius: 16px;
        box-shadow: 0 20px 45px -20px rgba(15, 23, 42, 0.35);
        display: none;
      }
      #lejechat-widget-frame.open {
        display: block;
      }
      #lejechat-widget-launcher {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        border: none;
        border-radius: 999px;
        background: ${accentColor};
        color: white;
        font-weight: 600;
        font-size: 14px;
        padding: 12px 18px;
        cursor: pointer;
        box-shadow: 0 12px 35px -18px rgba(15, 23, 42, 0.45);
        transition: transform 0.2s ease, box-shadow 0.2s ease;
      }
      #lejechat-widget-launcher:hover {
        transform: translateY(-2px);
        box-shadow: 0 16px 40px -20px rgba(15, 23, 42, 0.5);
      }
      #lejechat-widget-launcher svg {
        width: 16px;
        height: 16px;
      }
      @media (max-width: 560px) {
        #lejechat-widget-frame {
          width: calc(100vw - 32px);
          height: 70vh;
        }
      }
    `

  const buttonMarkup = `<span style="display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:999px;background:white;color:${accentColor};font-size:12px;font-weight:700;">?</span><span>${launcherLabel}</span>`

  return `(() => {
  const current = document.currentScript
  const srcParams = new URLSearchParams(current?.src.split('?')[1] || '')
  const slug = ${JSON.stringify(safeSlug)} || srcParams.get('slug') || current?.getAttribute('data-lejechat-slug')
  const accentColor = ${JSON.stringify(accentColor)} || srcParams.get('accent') || current?.getAttribute('data-lejechat-accent') || '${DEFAULTS.accent}'
  const launcherLabel = ${JSON.stringify(launcherLabel)} || srcParams.get('label') || current?.getAttribute('data-lejechat-label') || '${DEFAULTS.label}'
  const originHint = ${JSON.stringify(originHint)} || window.location.origin
  const requestedPosition = ${JSON.stringify(launcherPosition)} || srcParams.get('position') || current?.getAttribute('data-lejechat-position') || '${DEFAULTS.position}'

  if (!slug) {
    console.error('[Lejechat] Missing slug on embed script')
    if (current) {
      current.setAttribute('data-lejechat-error', 'missing-slug')
    }
    return
  }

  if (document.getElementById('lejechat-widget-launcher')) {
    console.warn('[Lejechat] Widget already mounted – skipping duplicate embed script load.')
    return
  }

  const normalizedPosition = requestedPosition === 'bottom-left' ? 'bottom-left' : 'bottom-right'
  const horizontalProp = normalizedPosition === 'bottom-left' ? 'left' : 'right'

  const createStyles = () => {
    const style = document.createElement('style')
    style.id = 'lejechat-widget-styles'
    style.textContent = ${JSON.stringify(cssBlock)}
    document.head.appendChild(style)
  }

  const container = document.createElement('div')
  container.id = 'lejechat-widget-container'
  document.body.appendChild(container)

  if (horizontalProp === 'left') {
    container.style.left = '20px'
    container.style.right = 'auto'
    container.style.alignItems = 'flex-start'
  }

  createStyles()

  const iframe = document.createElement('iframe')
  iframe.id = 'lejechat-widget-frame'
  iframe.title = 'Lejechat'
  iframe.allow = 'clipboard-write'
  const base = originHint.endsWith('/') ? originHint.slice(0, -1) : originHint
  iframe.src = base + '/chat/' + slug + '?embed=1'
  iframe.style.background = 'white'
  iframe.style.border = 'none'
  container.appendChild(iframe)

  const button = document.createElement('button')
  button.id = 'lejechat-widget-launcher'
  button.innerHTML = ${JSON.stringify(buttonMarkup)}
  button.addEventListener('click', () => {
    const isOpen = iframe.classList.toggle('open')
    if (isOpen) {
      iframe.contentWindow?.postMessage({ type: 'lejechat-opened' }, '*')
    }
  })
  container.appendChild(button)

  window.lejechatWidget = {
    open: () => {
      iframe.classList.add('open')
      iframe.contentWindow?.postMessage({ type: 'lejechat-opened' }, '*')
    },
    close: () => {
      iframe.classList.remove('open')
    },
    toggle: () => button.click(),
    slug,
    position: normalizedPosition,
  }
})()
  `
}
