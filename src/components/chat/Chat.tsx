"use client";

import { useState, useCallback, useRef, useEffect } from 'react';

// A simple component to render a chat message
const ChatMessage = ({ message, isUser }: { message: string; isUser: boolean }) => (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
        <div
            className={`max-w-xs rounded-lg px-4 py-2 text-sm ${
                isUser ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-800'
            }`}
        >
            {message}
        </div>
    </div>
);

export const Chat = ({ tripContext }: { tripContext: string }) => {
    const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSendMessage = useCallback(async () => {
        if (!input.trim()) return;

        const userMessage = { role: 'user' as const, content: input };
        setMessages((prev) => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        try {
            const response = await fetch('/api/support/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [...messages, userMessage],
                    tripContext,
                }),
            });

            if (!response.body) {
                throw new Error('No response body');
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let assistantMessage = '';
            
            setMessages((prev) => [...prev, { role: 'assistant' as const, content: '' }]);

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                assistantMessage += decoder.decode(value, { stream: true });
                setMessages((prev) => {
                    const newMessages = [...prev];
                    newMessages[newMessages.length - 1].content = assistantMessage;
                    return newMessages;
                });
            }
        } catch (error) {
            console.error('Error sending message:', error);
            setMessages((prev) => [
                ...prev,
                { role: 'assistant' as const, content: 'Sorry, I am having trouble connecting. Please try again later.' },
            ]);
        } finally {
            setIsLoading(false);
        }
    }, [input, messages, tripContext]);

    return (
        <div className="mt-3 flex h-96 flex-col rounded-xl border border-slate-700 bg-slate-900/60 p-3">
            <div className="flex-1 space-y-4 overflow-y-auto pr-2">
                {messages.map((msg, index) => (
                    <ChatMessage key={index} message={msg.content} isUser={msg.role === 'user'} />
                ))}
                <div ref={messagesEndRef} />
            </div>
            <div className="mt-4 flex">
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={(e) => {
                        if (e.key === 'Enter' && !isLoading) {
                            handleSendMessage();
                        }
                    }}
                    className="flex-1 rounded-l-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
                    placeholder="Type your message..."
                    disabled={isLoading}
                />
                <button
                    onClick={handleSendMessage}
                    disabled={isLoading}
                    className="rounded-r-md bg-indigo-500 px-4 py-1 text-xs font-semibold text-white hover:bg-indigo-400 disabled:bg-indigo-300"
                >
                    {isLoading ? 'Sending...' : 'Send'}
                </button>
            </div>
        </div>
    );
};
