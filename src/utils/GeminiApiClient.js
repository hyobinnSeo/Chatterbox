class GeminiApiClient {
    /**
     * Gemini API에 요청을 보내고 응답을 파싱합니다
     * @param {string} systemPrompt - 시스템 프롬프트
     * @param {string} userPrompt - 사용자 프롬프트
     * @param {string} personalityName - 인격 이름 (로깅용)
     * @returns {Promise<string>} 생성된 텍스트
     */
    static async generateContent(systemPrompt, userPrompt, personalityName = 'Bot') {
        console.log('\nComplete prompt being sent to Gemini:');
        console.log('System message:', systemPrompt);
        console.log('User message:', userPrompt);

        const response = await fetch('https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': process.env.GEMINI_API_KEY
            },
            body: JSON.stringify({
                contents: [
                    {
                        role: 'user',
                        parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }]
                    }
                ],
                generationConfig: {
                    temperature: 0.9,
                    maxOutputTokens: 8000
                }
            })
        });

        console.log('Response status:', response.status);
        console.log('Response headers:', Object.fromEntries(response.headers.entries()));
        
        if (!response.ok) {
            const errorText = await response.text();
            console.log('Error response body:', errorText);
            throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
        }

        const data = await response.json();
        console.log('Full API response:', JSON.stringify(data, null, 2));
        
        // Parse response with multiple fallback strategies
        const content = this.parseApiResponse(data, personalityName);
        
        if (!content) {
            console.log('No content found in response. Checking for other content...');
            console.log('Candidates:', data.candidates);
            console.log('Usage metadata:', data.usageMetadata);
            console.log('Prompt feedback:', data.promptFeedback);
            throw new Error('No response content received from Gemini');
        }

        return content;
    }

    /**
     * Gemini API 응답을 파싱합니다 (Thinking 모델 지원)
     * @param {Object} data - API 응답 데이터
     * @param {string} personalityName - 인격 이름 (로깅용)
     * @returns {string|null} 파싱된 텍스트 또는 null
     */
    static parseApiResponse(data, personalityName = 'Bot') {
        let content = null;
        const candidate = data.candidates?.[0];
        
        // Strategy 1: Standard response format
        if (candidate?.content?.parts?.[0]?.text) {
            content = candidate.content.parts[0].text;
            console.log(`${personalityName}: Found content using standard format`);
        } 
        // Strategy 2: Look for text in any part
        else if (candidate?.content?.parts) {
            for (const part of candidate.content.parts) {
                if (part.text) {
                    content = part.text;
                    console.log(`${personalityName}: Found content in parts array`);
                    break;
                }
            }
        } 
        // Strategy 3: Alternative structure
        else if (candidate?.content?.text) {
            content = candidate.content.text;
            console.log(`${personalityName}: Found content using alternative structure`);
        }
        
        // Strategy 4: Handle thinking process
        if (!content && data.usageMetadata?.thoughtsTokenCount > 0) {
            console.log(`${personalityName}: Looking for content after thinking process...`);
            // Check if there are multiple parts or hidden content
            if (candidate?.content?.role === 'model' && candidate.finishReason !== 'MAX_TOKENS') {
                // Check for alternative content structures
                console.log(`${personalityName}: Full candidate content:`, JSON.stringify(candidate.content, null, 2));
            }
        }

        return content;
    }
}

module.exports = GeminiApiClient; 