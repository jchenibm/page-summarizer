document.addEventListener('DOMContentLoaded', async function() {
  const apiEndpointInput = document.getElementById('api-endpoint');
  const apiKeyInput = document.getElementById('api-key');
  const settingsToggle = document.getElementById('settings-toggle');
  const settingsContent = document.querySelector('.settings-content');
  const settingsIcon = document.querySelector('.settings-icon');
  let saveTimeout;

  // Load saved API settings
  chrome.storage.sync.get(['apiEndpoint', 'apiKey', 'settingsOpen'], function(result) {
    apiEndpointInput.value = result.apiEndpoint || '';
    apiKeyInput.value = result.apiKey || '';
    
    // Restore settings panel state
    if (result.settingsOpen) {
      settingsContent.classList.add('open');
      settingsIcon.classList.add('open');
    }
  });

  // Toggle settings panel
  settingsToggle.addEventListener('click', function() {
    settingsContent.classList.toggle('open');
    settingsIcon.classList.toggle('open');
    
    // Save settings panel state
    chrome.storage.sync.set({
      settingsOpen: settingsContent.classList.contains('open')
    });
  });

  // Save API settings with debounce and feedback
  function saveSettings(input, key) {
    clearTimeout(saveTimeout);
    showSavingFeedback();
    
    saveTimeout = setTimeout(() => {
      chrome.storage.sync.set({ [key]: input.value }, () => {
        showSavedFeedback();
      });
    }, 500);
  }

  apiEndpointInput.addEventListener('input', () => saveSettings(apiEndpointInput, 'apiEndpoint'));
  apiKeyInput.addEventListener('input', () => saveSettings(apiKeyInput, 'apiKey'));

  // Handle summarize page button
  const summarizePageBtn = document.getElementById('summarize-page');
  summarizePageBtn.addEventListener('click', async function() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        throw new Error('No active tab found');
      }

      // 检查content script是否已注入
      try {
        await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
      } catch (error) {
        // 如果content script未注入，则注入它
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
      }

      showLoading(true);
      chrome.tabs.sendMessage(tab.id, { action: 'summarizePage' });
    } catch (error) {
      showError(error.message);
    }
  });

  // Handle summarize selection button
  const summarizeSelectionBtn = document.getElementById('summarize-selection');
  summarizeSelectionBtn.addEventListener('click', async function() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        throw new Error('No active tab found');
      }

      // 检查content script是否已注入
      try {
        await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
      } catch (error) {
        // 如果content script未注入，则注入它
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
      }

      showLoading(true);
      chrome.tabs.sendMessage(tab.id, { action: 'summarizeSelection' });
    } catch (error) {
      showError(error.message);
    }
  });

  // Handle generate knowledge card button
  const generateCardBtn = document.getElementById('generate-card');
  const copyMarkdownBtn = document.getElementById('copy-markdown');

  let originalMarkdown = ''; // 存储原始markdown

  function showSummary(summary) {
    originalMarkdown = summary; // 保存原始markdown
    const container = document.getElementById('summary-container');
    const summaryText = document.getElementById('summary-text');
    
    // 将markdown转换为HTML显示
    summaryText.innerHTML = marked.parse(summary);
    container.classList.remove('hidden');
  }

  generateCardBtn.addEventListener('click', function() {
    const summaryHTML = document.getElementById('summary-text').innerHTML;
    generateKnowledgeCard(summaryHTML);
  });

  // Handle copy markdown button
  copyMarkdownBtn.addEventListener('click', async function() {
    try {
      await navigator.clipboard.writeText(originalMarkdown);
      
      // 显示成功提示
      const originalText = copyMarkdownBtn.textContent;
      copyMarkdownBtn.textContent = 'Copied!';
      copyMarkdownBtn.style.backgroundColor = '#22c55e'; // 绿色
      
      // 2秒后恢复按钮状态
      setTimeout(() => {
        copyMarkdownBtn.textContent = originalText;
        copyMarkdownBtn.style.backgroundColor = '#2563eb'; // 恢复蓝色
      }, 2000);
    } catch (error) {
      console.error('Failed to copy markdown:', error);
      showError('Failed to copy markdown to clipboard');
    }
  });

  // Listen for messages from content script
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === 'showSummary') {
      showLoading(false);
      showSummary(request.summary);
    } else if (request.action === 'showError') {
      showError(request.error);
      if (request.canRetry) {
        addRetryButton();
      }
    }
  });
});

function showSavingFeedback() {
  const feedback = document.createElement('div');
  feedback.id = 'save-feedback';
  feedback.className = 'fixed top-4 right-4 bg-blue-500 text-white px-4 py-2 rounded shadow-lg z-50';
  feedback.textContent = 'Saving...';
  document.body.appendChild(feedback);
}

function showSavedFeedback() {
  const feedback = document.getElementById('save-feedback');
  if (feedback) {
    feedback.textContent = 'Saved!';
    feedback.className = 'fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded shadow-lg z-50';
    setTimeout(() => feedback.remove(), 2000);
  }
}

function showLoading(show) {
  document.getElementById('loading').classList.toggle('active', show);
  document.getElementById('summary-container').classList.toggle('hidden', show);
  document.getElementById('error-message').classList.add('hidden');
  
  // Disable buttons during loading
  const buttons = document.querySelectorAll('button:not(#settings-toggle)');
  buttons.forEach(button => button.disabled = show);
}

function showError(error) {
  const errorElement = document.getElementById('error-message');
  errorElement.textContent = error;
  errorElement.classList.remove('hidden');
  document.getElementById('loading').classList.remove('active');
}

function addRetryButton() {
  const errorElement = document.getElementById('error-message');
  const retryButton = document.createElement('button');
  retryButton.className = 'ml-2 bg-blue-500 hover:bg-blue-700 text-white font-bold py-1 px-3 rounded text-sm';
  retryButton.textContent = 'Retry';
  retryButton.onclick = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    showLoading(true);
    chrome.tabs.sendMessage(tab.id, { action: 'retry' });
  };
  errorElement.appendChild(retryButton);
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  // 处理中英文混合文本
  const characters = text.split('');
  let line = '';
  let currentY = y;

  for (let i = 0; i < characters.length; i++) {
    const char = characters[i];
    const testLine = line + char;
    const metrics = ctx.measureText(testLine);
    
    if (metrics.width > maxWidth && line) {
      ctx.fillText(line, x, currentY);
      line = char;
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }
  
  if (line) {
    ctx.fillText(line, x, currentY);
    currentY += lineHeight;
  }
  
  return currentY;
}

async function generateKnowledgeCard(html) {
  // 创建一个临时容器来计算实际渲染高度
  const tempContainer = document.createElement('div');
  tempContainer.style.width = '360px'; // 400px - 左右各20px padding
  tempContainer.style.padding = '0px 20px'; // 减小上下padding
  tempContainer.style.position = 'absolute';
  tempContainer.style.left = '-9999px';
  tempContainer.style.wordWrap = 'break-word';
  tempContainer.style.fontFamily = 'Roboto, Arial, sans-serif';
  document.body.appendChild(tempContainer);

  // 使用marked渲染Markdown
  tempContainer.innerHTML = marked.parse(html);

  // 应用基本样式
  const style = document.createElement('style');
  style.textContent = `
    h2 { font-size: 24px; margin: 20px 0 10px 0; line-height: 1.3; }
    h3 { font-size: 20px; margin: 15px 0 8px 0; line-height: 1.3; }
    p { font-size: 16px; margin: 8px 0; line-height: 1.5; }
    ul, ol { margin: 8px 0; padding-left: 20px; }
    li { font-size: 16px; margin: 4px 0; line-height: 1.5; }
  `;
  tempContainer.appendChild(style);

  // 获取实际内容高度（加上额外的padding和水印区域）
  const FOOTER_HEIGHT = 80; // 分割线和水印的高度
  const EXTRA_SPACE = 100; // 额外的空间用于行间距和元素间距
  const contentHeight = tempContainer.offsetHeight + FOOTER_HEIGHT + EXTRA_SPACE;

  // 创建canvas
  const BORDER_PADDING = 8; // 边框的内边距
  const DPI_SCALE = 3; // 提高分辨率
  const canvas = document.createElement('canvas');
  canvas.width = (400 + (BORDER_PADDING * 2)) * DPI_SCALE;
  canvas.height = (contentHeight + (BORDER_PADDING * 2)) * DPI_SCALE;

  const ctx = canvas.getContext('2d');
  ctx.scale(DPI_SCALE, DPI_SCALE); // 缩放画布上下文

  // 设置文本渲染优化
  ctx.textBaseline = 'top';
  ctx.textRendering = 'optimizeLegibility';
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // 绘制背景和阴影
  ctx.save();
  
  // 绘制阴影
  ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 2;

  // 绘制圆角矩形背景
  const radius = 12;
  ctx.beginPath();
  ctx.moveTo(BORDER_PADDING + radius, BORDER_PADDING);
  ctx.lineTo(canvas.width / DPI_SCALE - BORDER_PADDING - radius, BORDER_PADDING);
  ctx.quadraticCurveTo(canvas.width / DPI_SCALE - BORDER_PADDING, BORDER_PADDING, canvas.width / DPI_SCALE - BORDER_PADDING, BORDER_PADDING + radius);
  ctx.lineTo(canvas.width / DPI_SCALE - BORDER_PADDING, canvas.height / DPI_SCALE - BORDER_PADDING - radius);
  ctx.quadraticCurveTo(canvas.width / DPI_SCALE - BORDER_PADDING, canvas.height / DPI_SCALE - BORDER_PADDING, canvas.width / DPI_SCALE - BORDER_PADDING - radius, canvas.height / DPI_SCALE - BORDER_PADDING);
  ctx.lineTo(BORDER_PADDING + radius, canvas.height / DPI_SCALE - BORDER_PADDING);
  ctx.quadraticCurveTo(BORDER_PADDING, canvas.height / DPI_SCALE - BORDER_PADDING, BORDER_PADDING, canvas.height / DPI_SCALE - BORDER_PADDING - radius);
  ctx.lineTo(BORDER_PADDING, BORDER_PADDING + radius);
  ctx.quadraticCurveTo(BORDER_PADDING, BORDER_PADDING, BORDER_PADDING + radius, BORDER_PADDING);
  ctx.closePath();

  // 填充白色背景
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  // 绘制边框
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#e5e7eb';
  ctx.stroke();

  ctx.restore();

  // 绘制内容
  let y = BORDER_PADDING + 12; // 考虑边框内边距

  // 递归处理DOM树
  function processNode(node, level = 0) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent.trim();
      if (text) {
        // 处理列表项的缩进和符号
        if (level > 0) {
          const bullet = '•';
          const indent = level * 20;
          ctx.fillText(bullet, BORDER_PADDING + 20 + indent - 15, y);
          y = wrapText(ctx, text, BORDER_PADDING + 20 + indent, y, 360 - indent, 24);
        } else {
          y = wrapText(ctx, text, BORDER_PADDING + 20, y, 360, 24);
        }
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      // 跳过style标签
      if (node.tagName === 'STYLE') return y;

      // 设置字体样式
      if (node.tagName === 'H2') {
        ctx.font = '600 24px Roboto';
        ctx.fillStyle = '#1f2937';
        y += 30;
      } else if (node.tagName === 'H3') {
        ctx.font = '500 20px Roboto';
        ctx.fillStyle = '#374151';
        y += 25;
      } else {
        ctx.font = '400 16px Roboto';
        ctx.fillStyle = '#4b5563';
        if (!['UL', 'OL'].includes(node.tagName)) {
          y += 20;
        }
      }

      // 如果是列表容器，只处理其子元素
      if (['UL', 'OL'].includes(node.tagName)) {
        const listLevel = level + 1;
        Array.from(node.children).forEach(child => {
          processNode(child, listLevel);
        });
      } else {
        // 处理其他元素的所有子节点
        node.childNodes.forEach(child => {
          processNode(child, level);
        });
      }
    }
    return y;
  }

  // 开始处理内容
  tempContainer.childNodes.forEach(node => {
    y = processNode(node);
  });

  // 添加分隔线
  const lineY = canvas.height / DPI_SCALE - BORDER_PADDING - 50;
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(BORDER_PADDING + 20, lineY);
  ctx.lineTo(canvas.width / DPI_SCALE - BORDER_PADDING - 20, lineY);
  ctx.stroke();

  // 添加水印
  ctx.font = '400 14px Roboto';
  ctx.fillStyle = '#9ca3af';
  ctx.fillText('Generated by AI Summary Card Generator', BORDER_PADDING + 20, canvas.height / DPI_SCALE - BORDER_PADDING - 30);

  // 清理临时元素
  document.body.removeChild(tempContainer);

  // 转换为图片并下载
  try {
    const dataUrl = canvas.toDataURL('image/png');
    
    // 创建预览模态框
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.75);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 1000;
      cursor: pointer;
    `;

    // 创建预览图片
    const previewImg = document.createElement('img');
    previewImg.src = dataUrl;
    previewImg.style.cssText = `
      max-width: 90%;
      max-height: 90%;
      border-radius: 12px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      cursor: pointer;
    `;

    // 添加提示文本
    const hint = document.createElement('div');
    hint.textContent = '点击图片下载';
    hint.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      color: white;
      font-family: Roboto, sans-serif;
      font-size: 14px;
      padding: 8px 16px;
      background: rgba(0, 0, 0, 0.5);
      border-radius: 20px;
    `;

    // 点击事件处理
    const handleClick = async () => {
      // 下载图片
      const link = document.createElement('a');
      link.download = 'knowledge-card.png';
      link.href = dataUrl;
      link.click();

      try {
        // 复制到剪贴板
        const response = await fetch(dataUrl);
        const blob = await response.blob();
        await navigator.clipboard.write([
          new ClipboardItem({
            [blob.type]: blob
          })
        ]);

        // 显示成功提示
        hint.textContent = '已复制到剪贴板并下载';
        hint.style.background = 'rgba(34, 197, 94, 0.8)'; // 绿色背景
        setTimeout(() => {
          document.body.removeChild(modal);
        }, 1000);
      } catch (error) {
        console.error('复制到剪贴板失败:', error);
        // 仍然关闭模态框
        document.body.removeChild(modal);
      }
    };

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        document.body.removeChild(modal);
      }
    });

    previewImg.addEventListener('click', handleClick);

    // 组装并显示模态框
    modal.appendChild(previewImg);
    modal.appendChild(hint);
    document.body.appendChild(modal);

  } catch (error) {
    showError('Failed to generate knowledge card. Please try again.');
  }
}
