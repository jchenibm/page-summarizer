let lastText = '';
let retryCount = 0;
const MAX_RETRIES = 3;

// Listen for messages from popup
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  if (request.action === 'ping') {
    sendResponse({ status: 'ok' });
    return;
  }

  if (request.action === 'summarizePage') {
    const text = document.body.innerText;
    lastText = text;
    retryCount = 0;
    await generateSummary(text);
  } else if (request.action === 'summarizeSelection') {
    const selection = window.getSelection().toString();
    if (selection) {
      lastText = selection;
      retryCount = 0;
      await generateSummary(selection);
    } else {
      chrome.runtime.sendMessage({
        action: 'showError',
        error: 'Please select some text first',
        canRetry: false
      });
    }
  } else if (request.action === 'retry') {
    if (lastText && retryCount < MAX_RETRIES) {
      retryCount++;
      await generateSummary(lastText);
    } else {
      chrome.runtime.sendMessage({
        action: 'showError',
        error: 'Maximum retry attempts reached. Please try again later.',
        canRetry: false
      });
    }
  }
});

async function generateSummary(text) {
  try {
    // Get API settings
    const result = await chrome.storage.sync.get(['apiEndpoint', 'apiKey']);
    
    if (!result.apiEndpoint || !result.apiKey) {
      throw new Error('Please configure your API endpoint and key in the extension settings');
    }

    // Validate text length
    if (text.length < 10) {
      throw new Error('Text is too short to summarize');
    }

    // Prepare the request
    const prompt = `你是一个专业的文章总结助手。请帮我总结以下文章的要点，用markdown格式输出。
要求：
1. 简明扼要，突出重点
2. 总结要客观，不要有个人观点
3. 如果文章有结论，要体现出来
4. 如果有具体的数据，要保留
5. 如果原标题为英文，请翻译为中文。 

输出模板:            
## ${document.title}

原文链接: ${window.location.href}

### 文章总结 
{{3句话文章内容总结}}

### 主要观点 
{{列出3-5个要点，用无序列表}}

### 关键结论
{{如果有结论，用无序列表列出1-3个结论。如果没有明确结论，这部分可以省略}}
`;

    const response = await fetch(result.apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${result.apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: prompt
          },
          {
            role: 'user',
            content: `网页内容: ${text.substring(0, 8000)}`
          }
        ],
        max_tokens: 500,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || 'Failed to generate summary. Please check your API settings and try again.');
    }

    const data = await response.json();
    
    // 添加调试日志
    console.log('API Response:', data);
    
    // 更灵活地处理API响应
    let summary = '';
    if (data.choices && data.choices[0]) {
      if (data.choices[0].message && data.choices[0].message.content) {
        summary = data.choices[0].message.content.trim();
      } else if (data.choices[0].text) {
        summary = data.choices[0].text.trim();
      } else {
        console.error('Unexpected API response format:', data);
        throw new Error('Unexpected API response format');
      }
    } else if (data.response) {
      // 某些API可能直接返回response字段
      summary = data.response.trim();
    } else {
      console.error('Unexpected API response format:', data);
      throw new Error('Unexpected API response format');
    }

    if (!summary) {
      throw new Error('Received empty summary from API');
    }

    // Send the summary back to popup
    chrome.runtime.sendMessage({
      action: 'showSummary',
      summary: summary
    });

  } catch (error) {
    console.error('Error in generateSummary:', error);
    const isRetryable = error.message.includes('rate limit') || 
                       error.message.includes('timeout') || 
                       error.message.includes('network') ||
                       retryCount < MAX_RETRIES;

    chrome.runtime.sendMessage({
      action: 'showError',
      error: error.message,
      canRetry: isRetryable
    });
  }
}
