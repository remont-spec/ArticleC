/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FileText, 
  PlusCircle, 
  History, 
  BarChart3, 
  Download, 
  Settings, 
  LayoutDashboard,
  CloudUpload,
  Loader2,
  ChevronRight,
  ShieldCheck,
  Search,
  ExternalLink,
  Trash2,
  Copy,
  RefreshCw,
  FileDown,
  Edit3,
  CheckCircle2,
  XCircle,
  Globe,
  Sparkles
} from 'lucide-react';
import { ArticleVersion, ExtractedInfo, WritingStyle, WordPressConfig } from './types';
import { generateArticle, analyzeArticle, applyLayout, humanizeArticle } from './geminiService';
import stringSimilarity from 'string-similarity';
import ReactMarkdown from 'react-markdown';
import { marked } from 'marked';
import Highlighter from 'react-highlight-words';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { WPPattern } from './types';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Helper to safely highlight text within potentially nested React children
function highlightTerms(children: any, searchTerm: string): React.ReactNode {
  if (!searchTerm || !children) return children;

  return React.Children.map(children, (child) => {
    if (typeof child === 'string') {
      return (
        <Highlighter
          highlightClassName="bg-yellow-200 text-slate-900 rounded-sm px-0.5 font-medium"
          searchWords={[searchTerm]}
          autoEscape={true}
          textToHighlight={child}
        />
      );
    }
    
    // If it's a React element with children (like <strong>), recursively highlight
    if (child && typeof child === 'object' && 'props' in child && child.props.children) {
      try {
        return {
          ...child,
          props: {
            ...child.props,
            children: highlightTerms(child.props.children, searchTerm)
          }
        };
      } catch (e) {
        return child;
      }
    }
    
    return child;
  });
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'generator' | 'archive' | 'analysis'>('generator');
  const [versions, setVersions] = useState<ArticleVersion[]>([]);
  const [currentArticle, setCurrentArticle] = useState<ArticleVersion | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isHumanizing, setIsHumanizing] = useState(false);
  const [extractedDocs, setExtractedDocs] = useState<ExtractedInfo[]>([]);
  const [analysisResult, setAnalysisResult] = useState<{ score: number; suggestions: string[]; plagiarismScore: number } | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [articleSubTab, setArticleSubTab] = useState<'content' | 'seo'>('content');
  const [manualText, setManualText] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [wpConfig, setWpConfig] = useState<WordPressConfig | null>(null);
  const [showWpSettings, setShowWpSettings] = useState(false);
  const [showAppSettings, setShowAppSettings] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [isSendingToWp, setIsSendingToWp] = useState(false);

  // Layout State
  const [showLayoutModal, setShowLayoutModal] = useState(false);
  const [layoutSearchQuery, setLayoutSearchQuery] = useState('');
  const [foundLayouts, setFoundLayouts] = useState<WPPattern[]>([]);
  const [isSearchingLayouts, setIsSearchingLayouts] = useState(false);
  const [selectedLayout, setSelectedLayout] = useState<WPPattern | null>(null);
  const [layoutUsageInstructions, setLayoutUsageInstructions] = useState('Използвай този лейаут за основната структура на статията. Постави заглавието в основния хедър, а текста в параграфите.');

  useEffect(() => {
    const savedHeaders = localStorage.getItem('articlec_wp_config');
    if (savedHeaders) setWpConfig(JSON.parse(savedHeaders));

    const savedTheme = localStorage.getItem('articlec_theme') as 'light' | 'dark' | null;
    if (savedTheme) {
      setTheme(savedTheme);
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('articlec_theme', newTheme);
  };

  const saveWpConfig = (config: WordPressConfig) => {
    setWpConfig(config);
    localStorage.setItem('articlec_wp_config', JSON.stringify(config));
    setShowWpSettings(false);
  };

  useEffect(() => {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    });
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  const handleSearchLayouts = async () => {
    if (!wpConfig || !layoutSearchQuery) return;
    setIsSearchingLayouts(true);
    try {
      const params = new URLSearchParams({
        baseUrl: wpConfig.baseUrl,
        username: wpConfig.username,
        appPassword: wpConfig.appPassword,
        search: layoutSearchQuery
      });
      const response = await fetch(`/api/wp/patterns?${params.toString()}`);
      if (!response.ok) throw new Error('Грешка при търсене на макети');
      const data = await response.json();
      setFoundLayouts(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      alert('Неуспешно търсене на макети. Проверете WordPress настройките си.');
    } finally {
      setIsSearchingLayouts(false);
    }
  };

  // Form State
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState<WritingStyle>('formal');
  const [useSearch, setUseSearch] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem('articlec_versions');
    if (saved) setVersions(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem('articlec_versions', JSON.stringify(versions));
  }, [versions]);

  const handleGenerate = async () => {
    if (!prompt) return;
    setIsGenerating(true);
    try {
      const additionalContext = extractedDocs.map(d => `--- ${d.name} ---\n${d.text}`).join('\n\n');
      const newVersion = await generateArticle(prompt, style, "Bulgarian", additionalContext, useSearch);
      setCurrentArticle(newVersion);
      setVersions([newVersion, ...versions]);
      setActiveTab('generator');
      setIsEditing(false);
    } catch (error) {
      console.error(error);
      alert('Възникна грешка при генерирането.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAnalyze = async (textToAnalyze?: string) => {
    const text = textToAnalyze || (currentArticle?.content);
    if (!text) return;
    
    setIsAnalyzing(true);
    try {
      const res = await analyzeArticle(text);
      
      // Допълнителна проверка чрез съблиотека (Library check) срещу изходните документи
      if (extractedDocs.length > 0) {
        const sourceTexts = extractedDocs.map(d => d.text);
        const matches = stringSimilarity.findBestMatch(text, sourceTexts);
        const localSimilarity = Math.round(matches.bestMatch.rating * 100);
        
        // Комбинираме резултатите: ако има голямо сходство с изходен документ, отразяваме го
        if (localSimilarity > 30) {
          res.suggestions.push(`[Библиотечен Анализ] Открито е ${localSimilarity}% сходство със зареден документ: "${matches.bestMatch.target.substring(0, 50)}..."`);
          // Можем да коригираме plagiarismScore ако е необходимо, но Gemini Grounding е по-точен за уеб.
        }
      }
      
      setAnalysisResult(res);
      setActiveTab('analysis');
    } catch (error) {
      console.error(error);
      alert('Възникна грешка при анализа.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleHumanize = async () => {
    if (!currentArticle) return;
    
    setIsHumanizing(true);
    try {
      const humanizedContent = await humanizeArticle(currentArticle.content);
      const updated = { ...currentArticle, content: humanizedContent };
      setCurrentArticle(updated);
      setVersions(versions.map(v => v.id === updated.id ? updated : v));
      alert('Текстът беше успешно хуманизиран!');
    } catch (error) {
      console.error(error);
      alert('Възникна грешка при хуманизирането.');
    } finally {
      setIsHumanizing(false);
    }
  };

  const saveEdit = () => {
    if (!currentArticle) return;
    const updated = { ...currentArticle, content: editContent };
    setCurrentArticle(updated);
    setVersions(versions.map(v => v.id === updated.id ? updated : v));
    setIsEditing(false);
  };

  const cancelEdit = () => {
    setIsEditing(false);
  };

  const startEditing = () => {
    if (currentArticle) {
      setEditContent(currentArticle.content);
      setIsEditing(true);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const formData = new FormData();
    Array.from(e.target.files).forEach(file => formData.append('files', file));

    try {
      const response = await fetch('/api/extract-text', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      setExtractedDocs([...extractedDocs, ...data.extractedTexts]);
    } catch (error) {
      console.error('Upload failed', error);
    }
  };

  const exportCSV = () => {
    if (!currentArticle) return;
    const headers = ['Title', 'Meta Description', 'Content', 'Sources'];
    const row = [
      `"${currentArticle.title.replace(/"/g, '""')}"`,
      `"${currentArticle.metaDescription.replace(/"/g, '""')}"`,
      `"${currentArticle.content.replace(/"/g, '""')}"`,
      `"${currentArticle.sources.map(s => `${s.title}: ${s.url}`).join(' | ').replace(/"/g, '""')}"`
    ];
    const csvContent = [headers.join(','), row.join(',')].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `article-${currentArticle.id}.csv`);
    link.click();
  };

  const exportTxt = () => {
    if (!currentArticle) return;
    const content = `Title: ${currentArticle.title}\n\nMeta Description: ${currentArticle.metaDescription}\n\nContent:\n${currentArticle.content}\n\nSources:\n${currentArticle.sources.map(s => `${s.title}: ${s.url}`).join('\n')}`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `article-${currentArticle.id}.txt`);
    link.click();
  };

  const handleSendToWordPress = async () => {
    if (!currentArticle) return;
    if (!wpConfig) {
      setShowWpSettings(true);
      return;
    }

    setIsSendingToWp(true);
    try {
      // Function to convert Markdown to WordPress Blocks
      const markdownToWpBlocks = async (markdown: string): Promise<string> => {
        const tokens = marked.lexer(markdown);
        let blocks = '';

        for (const token of tokens) {
          switch (token.type) {
            case 'heading':
              blocks += `<!-- wp:heading {"level":${token.depth}} -->\n<h${token.depth}>${token.text}</h${token.depth}>\n<!-- /wp:heading -->\n\n`;
              break;
            case 'paragraph':
              const pContent = await marked.parseInline(token.text);
              blocks += `<!-- wp:paragraph -->\n<p>${pContent}</p>\n<!-- /wp:paragraph -->\n\n`;
              break;
            case 'list':
              const listTag = token.ordered ? 'ol' : 'ul';
              blocks += `<!-- wp:list {"ordered":${token.ordered === true}} -->\n<${listTag}>\n`;
              for (const item of token.items) {
                blocks += `<li>${await marked.parseInline(item.text)}</li>\n`;
              }
              blocks += `</${listTag}>\n<!-- /wp:list -->\n\n`;
              break;
            case 'code':
              blocks += `<!-- wp:code -->\n<pre class="wp-block-code"><code>${token.text}</code></pre>\n<!-- /wp:code -->\n\n`;
              break;
            case 'blockquote':
              blocks += `<!-- wp:quote -->\n<blockquote class="wp-block-quote"><p>${await marked.parseInline(token.text)}</p></blockquote>\n<!-- /wp:quote -->\n\n`;
              break;
            case 'hr':
              blocks += `<!-- wp:separator -->\n<hr class="wp-block-separator"/>\n<!-- /wp:separator -->\n\n`;
              break;
            case 'space':
              break;
            default:
              // Fallback to regular HTML for other types
              blocks += await marked.parse(token.raw);
              break;
          }
        }

        return blocks;
      };

      let wordpressContent = '';
      if (selectedLayout) {
        // If a layout is selected, use Gemini to fit the content into the layout
        wordpressContent = await applyLayout(
          currentArticle.content,
          selectedLayout.content,
          layoutUsageInstructions
        );
      } else {
        // Convert Markdown to WordPress Blocks (standard)
        wordpressContent = await markdownToWpBlocks(currentArticle.content);
      }

      const response = await fetch('/api/wp/create-post', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          baseUrl: wpConfig.baseUrl,
          username: wpConfig.username,
          appPassword: wpConfig.appPassword,
          postData: {
            title: currentArticle.title,
            content: wordpressContent,
            excerpt: currentArticle.metaDescription,
            status: 'draft',
            format: 'standard',
            meta: {
              _yoast_wpseo_metadesc: currentArticle.metaDescription,
              _yoast_wpseo_focuskw: currentArticle.keywords?.[0] || currentArticle.topic,
              _yoast_wpseo_title: currentArticle.title,
              _yoast_wpseo_metakeywords: currentArticle.keywords?.join(', ') || ''
            }
          }
        })
      });

      const data = await response.json();

      if (response.ok) {
        alert('Статията е изпратена успешно в WordPress като чернова!');
        window.open(`${wpConfig.baseUrl}/wp-admin/post.php?post=${data.id}&action=edit`, '_blank');
      } else {
        // Detailed error handling for common WP issues
        let errorMsg = data.message || 'Възникна грешка при изпращане.';
        if (data.code === 'rest_cannot_create') {
          errorMsg = 'Нямате права за създаване на публикации. Моля, проверете дали Вашия потребител е с роля Author, Editor или Administrator.';
        } else if (data.code === 'rest_forbidden') {
          errorMsg = 'Грешно потребителско име или Application Password.';
        }
        throw new Error(errorMsg);
      }
    } catch (error: any) {
      console.error(error);
      alert('Грешка при изпращане към WordPress: ' + error.message);
    } finally {
      setIsSendingToWp(false);
    }
  };

  return (
    <div className={cn(
      "flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden text-slate-900 dark:text-slate-100 transition-colors duration-300",
      theme === 'dark' && 'dark'
    )} style={{ textTransform: 'none' }}>
      {/* Sidebar */}
      <aside className="w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col transition-colors duration-300">
        <div className="p-6 border-bottom border-slate-100 dark:border-slate-800 flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-200 dark:shadow-none">
            <FileText size={24} />
          </div>
          <h1 className="font-semibold text-xl text-slate-800 dark:text-slate-100 tracking-tight">ArticleC</h1>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1">
          <button 
            onClick={() => setActiveTab('generator')}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all font-medium text-sm",
              activeTab === 'generator' 
                ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400" 
                : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
            )}
          >
            <PlusCircle size={20} />
            Генератор
          </button>
          <button 
            onClick={() => setActiveTab('archive')}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all font-medium text-sm",
              activeTab === 'archive' 
                ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400" 
                : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
            )}
          >
            <History size={20} />
            Архив
          </button>
          <button 
            onClick={() => setActiveTab('analysis')}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all font-medium text-sm",
              activeTab === 'analysis' 
                ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400" 
                : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
            )}
          >
            <BarChart3 size={20} />
            Проверка & Анализ
          </button>
        </nav>

        <div className="p-4 border-t border-slate-100 dark:border-slate-800 mt-auto">
          {deferredPrompt && (
            <button 
              onClick={handleInstallClick}
              className="w-full flex items-center gap-3 px-4 py-3 mb-4 rounded-lg bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 transition-all shadow-md shadow-blue-100 dark:shadow-none"
            >
              <Download size={18} />
              Инсталирай като Ап
            </button>
          )}
          <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg mb-4">
            <p className="text-[10px] font-bold text-slate-400 mb-2 tracking-tight">Източници</p>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                <CloudUpload size={14} />
                <span>Качи файлове (PDF/DOCX)</span>
                <input type="file" multiple hidden onChange={handleFileUpload} accept=".pdf,.docx,.txt" />
              </label>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {extractedDocs.map((doc, idx) => (
                  <div key={idx} className="flex items-center justify-between text-[11px] bg-white dark:bg-slate-800 p-1.5 rounded border border-slate-200 dark:border-slate-700">
                    <span className="truncate flex-1">{doc.name}</span>
                    <button onClick={() => setExtractedDocs(extractedDocs.filter((_, i) => i !== idx))} className="text-slate-400 hover:text-red-500">
                      <Trash2 size={10} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <button 
            onClick={() => setShowLayoutModal(true)}
            className="w-full flex items-center gap-3 px-4 py-3 mb-4 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 font-semibold text-sm hover:bg-indigo-100 dark:hover:bg-indigo-800 transition-all border border-indigo-100 dark:border-indigo-800"
          >
            <LayoutDashboard size={18} />
            WordPress Макети
          </button>
          <button 
            onClick={() => setShowWpSettings(true)}
            className="w-full flex items-center gap-3 px-4 py-3 mb-4 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-semibold text-sm hover:bg-emerald-100 dark:hover:bg-emerald-800 transition-all border border-emerald-100 dark:border-emerald-800"
          >
            <Globe size={18} />
            WordPress Настройки
          </button>

          <div className="flex items-center justify-between px-1">
            <p className="text-[10px] text-slate-400 font-mono">Версия 1.2.5</p>
            <button 
              onClick={() => setShowAppSettings(true)}
              className="p-1 text-slate-400 hover:text-blue-600 transition-colors"
              title="Настройки на приложението"
            >
              <Settings size={14} />
            </button>
          </div>
        </div>
      </aside>

      {/* WordPress Settings Modal */}
      <AnimatePresence>
        {showWpSettings && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-8 max-w-md w-full border border-slate-200 dark:border-slate-800 transition-colors duration-300"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg">
                    <Globe size={24} />
                  </div>
                  <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">WordPress Настройки</h3>
                </div>
                <button onClick={() => setShowWpSettings(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                  <XCircle size={24} />
                </button>
              </div>

              <form onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                saveWpConfig({
                  baseUrl: fd.get('baseUrl') as string,
                  username: fd.get('username') as string,
                  appPassword: fd.get('appPassword') as string,
                });
              }} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">WordPress URL</label>
                  <input 
                    name="baseUrl" 
                    defaultValue={wpConfig?.baseUrl || 'https://eldvigateli.com'} 
                    required 
                    placeholder="https://yoursite.com"
                    className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Потребителско име</label>
                  <input 
                    name="username" 
                    defaultValue={wpConfig?.username || ''} 
                    required 
                    className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Application Password</label>
                  <input 
                    name="appPassword" 
                    type="password"
                    defaultValue={wpConfig?.appPassword || ''} 
                    required 
                    className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm"
                  />
                  <p className="text-[10px] text-slate-400 mt-2 leading-relaxed bg-slate-50 dark:bg-slate-800/50 p-2 rounded border border-slate-100 dark:border-slate-800">
                    <strong className="text-slate-600 dark:text-slate-300 block mb-1">Важно:</strong>
                    1. Използвайте <strong>Application Password</strong> (Потребители {'->'} Профил), а не основната парола.<br/>
                    2. Потребителят трябва да има роля <strong>Author</strong> или по-висока.<br/>
                    3. Ако получавате грешка за права, проверете дали ролята на потребителя позволява създаване на публикации.
                  </p>
                </div>
                
                <button 
                  type="submit"
                  className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg"
                >
                  Запази Конфигурацията
                </button>
              </form>
            </motion.div>
          </div>
        )}

        {/* Layout Selection Modal */}
        {showLayoutModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-8 max-w-2xl w-full border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto transition-colors duration-300"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg">
                    <LayoutDashboard size={24} />
                  </div>
                  <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">WordPress Макети (Layouts)</h3>
                </div>
                <button onClick={() => setShowLayoutModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                  <XCircle size={24} />
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Търсене на макети в WordPress</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input 
                        type="text"
                        value={layoutSearchQuery}
                        onChange={(e) => setLayoutSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearchLayouts()}
                        placeholder="Име на макет (напр. 'article', 'post', 'blog')..."
                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm"
                      />
                    </div>
                    <button 
                      onClick={handleSearchLayouts}
                      disabled={isSearchingLayouts || !wpConfig}
                      className="px-6 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center gap-2"
                    >
                      {isSearchingLayouts ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
                      Търси
                    </button>
                  </div>
                  {!wpConfig && <p className="text-[10px] text-red-500 mt-1">Първо конфигурирайте WordPress профила си.</p>}
                </div>

                {foundLayouts.length > 0 && (
                  <div className="space-y-3">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Открити макети</label>
                    <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto pr-2">
                      {foundLayouts.map((layout) => (
                        <button
                          key={layout.name}
                          onClick={() => setSelectedLayout(layout)}
                          className={cn(
                            "text-left p-4 rounded-xl border transition-all flex items-center justify-between group",
                            selectedLayout?.name === layout.name 
                              ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 ring-1 ring-indigo-500" 
                              : "border-slate-100 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-700 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                          )}
                        >
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{layout.title}</p>
                              {layout.source === 'user' ? (
                                <span className="px-1.5 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-[9px] font-bold uppercase tracking-wider">
                                  Личен
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[9px] font-bold uppercase tracking-wider">
                                  Системен
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">{layout.name}</p>
                          </div>
                          {selectedLayout?.name === layout.name && <CheckCircle2 size={18} className="text-indigo-600 dark:text-indigo-400" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {selectedLayout && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="p-4 bg-indigo-50/50 dark:bg-indigo-900/10 rounded-xl border border-indigo-100 dark:border-indigo-900/30">
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-xs font-bold text-indigo-700 dark:text-indigo-400 uppercase">Използване на макета</label>
                        <button onClick={() => setSelectedLayout(null)} className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline">Откажи избора</button>
                      </div>
                      <textarea 
                        value={layoutUsageInstructions}
                        onChange={(e) => setLayoutUsageInstructions(e.target.value)}
                        placeholder="Опишете как точно искате да се използва този макет..."
                        className="w-full h-32 p-4 rounded-lg bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-800 focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm resize-none text-slate-800 dark:text-slate-100"
                      />
                      <p className="text-[10px] text-indigo-500 dark:text-indigo-400 mt-2 italic">
                        * Изкуственият интелект ще се опита да напасне съдържанието на статията в структурата на избрания макет според горните инструкции.
                      </p>
                    </div>
                  </div>
                )}

                <button 
                  onClick={() => setShowLayoutModal(false)}
                  className="w-full py-4 bg-slate-800 dark:bg-slate-700 text-white rounded-xl font-bold hover:bg-slate-900 dark:hover:bg-slate-600 transition-all shadow-lg"
                >
                  Затвори
                </button>
              </div>
            </motion.div>
          </div>
        )}
        {/* App Settings Modal */}
        {showAppSettings && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-8 max-w-md w-full border border-slate-200 dark:border-slate-800 transition-colors duration-300"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg">
                    <Settings size={24} />
                  </div>
                  <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">Настройки</h3>
                </div>
                <button onClick={() => setShowAppSettings(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                  <XCircle size={24} />
                </button>
              </div>

              <div className="space-y-6">
                <div className="flex items-center justify-between p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/10">
                  <div>
                    <p className="font-bold text-sm text-slate-800 dark:text-slate-100">Тъмна Тема</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Превключване между светъл и тъмен режим.</p>
                  </div>
                  <button 
                    onClick={toggleTheme}
                    className={cn(
                      "w-12 h-6 rounded-full transition-all relative flex items-center shadow-inner",
                      theme === 'dark' ? "bg-blue-600" : "bg-slate-200"
                    )}
                  >
                    <div className={cn(
                      "absolute w-4 h-4 rounded-full bg-white transition-all shadow-md",
                      theme === 'dark' ? "left-7" : "left-1"
                    )} />
                  </button>
                </div>

                <button 
                  onClick={() => setShowAppSettings(false)}
                  className="w-full py-4 bg-slate-800 dark:bg-slate-700 text-white rounded-xl font-bold hover:bg-slate-900 dark:hover:bg-slate-600 transition-all shadow-lg"
                >
                  Затвори
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 p-8 transition-colors duration-300">
        <AnimatePresence mode="wait">
          {activeTab === 'generator' && (
            <motion.div 
              key="generator"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-4xl mx-auto space-y-8"
            >
              <header>
                <h2 className="text-3xl font-semibold text-slate-900 dark:text-slate-100 mb-2">Напишете Вашата Статия</h2>
                <p className="text-slate-500 dark:text-slate-400">Използвайте изкуствен интелект за създаване на качествено съдържание.</p>
              </header>

              <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 space-y-6">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Тема или Промпт</label>
                  <textarea 
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Напр.: Предимствата на здравословното хранене за продуктивността..."
                    className="w-full h-32 p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none resize-none text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Стил на писане</label>
                    <select 
                      value={style}
                      onChange={(e) => setStyle(e.target.value as WritingStyle)}
                      className="w-full p-3 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-blue-500 transition-all outline-none bg-white dark:bg-slate-800"
                    >
                      <option value="formal">Официален</option>
                      <option value="informal">Неофициален / Блог</option>
                      <option value="academic">Академичен</option>
                      <option value="creative">Креативен / Художествен</option>
                      <option value="technical">Технически</option>
                    </select>
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex-1">
                      <input 
                        type="checkbox" 
                        checked={useSearch}
                        onChange={(e) => setUseSearch(e.target.checked)}
                        className="w-4 h-4 text-blue-600 rounded"
                      />
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Търсене в интернет (Grounding)</span>
                      <Search size={16} className="text-slate-400 ml-auto" />
                    </label>
                  </div>
                </div>

                  <button 
                    onClick={handleGenerate}
                    disabled={isGenerating || !prompt}
                    className={cn(
                      "w-full py-4 bg-blue-600 text-white rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-100 dark:shadow-none",
                      "normal-case"
                    )}
                  >
                    {isGenerating ? <Loader2 size={24} className="animate-spin" /> : <PlusCircle size={20} />}
                    {isGenerating ? "Генериране..." : "Генерирай Статия"}
                  </button>
              </div>

              {currentArticle && (
                <div className="bg-white p-8 rounded-2xl shadow-md border border-slate-200 space-y-6 transition-all duration-300">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                    <div>
                      <h3 className="text-xl font-bold text-slate-900">{currentArticle.title}</h3>
                      <p className="text-xs text-slate-400 font-mono mt-1">Версия ID: {currentArticle.id}</p>
                    </div>
                    <div className="flex gap-2">
                      {!isEditing ? (
                        <button onClick={startEditing} className="p-2 text-slate-600 hover:bg-slate-50 rounded-lg transition-colors border border-slate-100" title="Редактирай">
                          <Edit3 size={20} />
                        </button>
                      ) : (
                        <>
                          <button onClick={saveEdit} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors border border-emerald-100" title="Запази">
                            <CheckCircle2 size={20} />
                          </button>
                          <button onClick={cancelEdit} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-red-100" title="Откажи">
                            <XCircle size={20} />
                          </button>
                        </>
                      )}
                       <button onClick={exportCSV} className="p-2 text-slate-600 hover:bg-slate-50 rounded-lg transition-colors border border-slate-100" title="Експорт като CSV">
                        <FileDown size={20} />
                      </button>
                      <button onClick={exportTxt} className="p-2 text-slate-600 hover:bg-slate-50 rounded-lg transition-colors border border-slate-100" title="Експорт като TXT">
                        <Download size={20} />
                      </button>
                      <button 
                        onClick={handleHumanize} 
                        disabled={isHumanizing}
                        className={cn(
                          "p-2 rounded-lg transition-all shadow-sm flex items-center gap-2 px-3 border",
                          "border-amber-100 bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                        )} 
                        title="Хуманизирай текста (Humanize)"
                      >
                        {isHumanizing ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                        <span className="text-xs font-bold whitespace-nowrap">Хуманизирай</span>
                      </button>
                      <button onClick={() => handleAnalyze()} className="p-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-all shadow-sm" title="Анализ на статията">
                        <BarChart3 size={20} />
                      </button>
                      
                      <button 
                        onClick={() => setShowLayoutModal(true)}
                        className={cn(
                          "p-2 rounded-lg transition-all shadow-sm flex items-center gap-2 px-3 border",
                          selectedLayout 
                            ? "border-indigo-600 bg-indigo-600 text-white" 
                            : "border-slate-100 bg-white text-slate-600 hover:bg-slate-50"
                        )}
                        title="Избери макет за статията"
                      >
                        <LayoutDashboard size={18} />
                        <span className="text-xs font-bold">{selectedLayout ? selectedLayout.title : "Без макет"}</span>
                      </button>
                      <button 
                        onClick={handleSendToWordPress} 
                        disabled={isSendingToWp}
                        className="p-2 bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg transition-all shadow-sm flex items-center gap-2 px-3 disabled:opacity-50" 
                        title="Изпрати в WordPress"
                      >
                        {isSendingToWp ? <Loader2 size={18} className="animate-spin" /> : <Globe size={18} />}
                        <span className="text-xs font-bold">WordPress</span>
                      </button>
                    </div>
                  </div>

                  <div className="flex border-b border-slate-100 px-2">
                    <button 
                      onClick={() => setArticleSubTab('content')}
                      className={cn(
                        "px-4 py-2 text-xs font-semibold tracking-wider transition-all border-b-2",
                        articleSubTab === 'content' 
                          ? "border-blue-600 text-blue-600" 
                          : "border-transparent text-slate-400 hover:text-slate-600"
                      )}
                    >
                      Съдържание
                    </button>
                    <button 
                      onClick={() => setArticleSubTab('seo')}
                      className={cn(
                        "px-4 py-2 text-xs font-semibold tracking-wider transition-all border-b-2",
                        articleSubTab === 'seo' 
                          ? "border-blue-600 text-blue-600" 
                          : "border-transparent text-slate-400 hover:text-slate-600"
                      )}
                    >
                      SEO & Медия
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-6 pt-2">
                    {articleSubTab === 'content' ? (
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-xl border border-slate-200">
                          <Search size={16} className="text-slate-400 ml-2" />
                          <input 
                            type="text" 
                            placeholder="Търсене в текста..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="bg-transparent border-none focus:ring-0 text-sm flex-1 text-slate-700 placeholder:text-slate-400"
                          />
                          {searchTerm && (
                            <div className="flex items-center gap-2 mr-2">
                              <span className="text-[10px] font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full whitespace-nowrap">
                                {((currentArticle?.content || '').match(new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length} съвпадения
                              </span>
                              <button onClick={() => setSearchTerm('')} className="text-slate-400 hover:text-slate-600">
                                <XCircle size={14} />
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="prose prose-slate max-w-none min-h-[500px]">
                          {isEditing ? (
                            <textarea 
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              className="w-full h-[600px] p-6 font-mono text-sm border-none focus:ring-0 bg-slate-50/50 rounded-xl text-slate-800"
                            />
                          ) : (
                            <ReactMarkdown
                              components={{
                                p: ({ children }) => <p className="mb-4 leading-relaxed text-slate-800">{highlightTerms(children, searchTerm)}</p>,
                                h1: ({ children }) => <h1 className="text-3xl font-bold mt-10 mb-6 text-slate-900 border-b border-slate-100 pb-2">{highlightTerms(children, searchTerm)}</h1>,
                                h2: ({ children }) => <h2 className="text-2xl font-bold mt-8 mb-4 text-slate-800">{highlightTerms(children, searchTerm)}</h2>,
                                h3: ({ children }) => <h3 className="text-xl font-bold mt-6 mb-3 text-slate-800">{highlightTerms(children, searchTerm)}</h3>,
                                li: ({ children }) => <li className="mb-2 ml-4 list-disc text-slate-800">{highlightTerms(children, searchTerm)}</li>,
                                ul: ({ children }) => <ul className="mb-6">{children}</ul>,
                                ol: ({ children }) => <ol className="mb-6 list-decimal ml-4">{children}</ol>,
                                strong: ({ children }) => <strong className="font-bold text-slate-900">{highlightTerms(children, searchTerm)}</strong>,
                                em: ({ children }) => <em className="italic">{highlightTerms(children, searchTerm)}</em>
                              }}
                            >
                              {currentArticle.content}
                            </ReactMarkdown>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <section className="space-y-4">
                          <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                             <Search size={16} className="text-blue-500" />
                             SEO Метаданни
                          </h4>
                          <div className="grid grid-cols-1 gap-4">
                             <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                               <p className="text-[10px] font-bold text-slate-400 mb-1 tracking-tight">Мета Описание</p>
                               <p className="text-sm text-slate-700 leading-relaxed font-medium">{currentArticle.metaDescription}</p>
                             </div>
                             <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                               <p className="text-[10px] font-bold text-slate-400 mb-2 tracking-tight">Ключови думи</p>
                               <div className="flex flex-wrap gap-2">
                                 {currentArticle.keywords?.map((kw, i) => (
                                   <span key={i} className="px-3 py-1 bg-white border border-slate-200 rounded-full text-xs text-blue-600 font-semibold shadow-sm">
                                     {kw}
                                   </span>
                                 ))}
                               </div>
                             </div>
                          </div>
                        </section>

                        <section className="space-y-4">
                          <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                             <LayoutDashboard size={16} className="text-blue-500" />
                             Предложения за изображения
                          </h4>
                          <div className="grid grid-cols-1 gap-3">
                             {currentArticle.imageSuggestions?.map((suggestion, i) => (
                               <a 
                                 key={i} 
                                 href={typeof suggestion === 'string' ? `https://unsplash.com/s/photos/${suggestion}` : suggestion.searchUrl}
                                 target="_blank"
                                 rel="noopener noreferrer"
                                 className="flex items-start gap-3 p-3 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-blue-300 hover:shadow-md transition-all group"
                               >
                                 <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 flex-shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                   <ExternalLink size={16} />
                                 </div>
                                 <div className="flex-1">
                                   <p className="text-sm font-semibold text-slate-800 line-clamp-1">{typeof suggestion === 'string' ? suggestion : suggestion.description}</p>
                                   <p className="text-[10px] text-blue-500 mt-1 font-medium">Виж в Unsplash →</p>
                                 </div>
                               </a>
                             ))}
                          </div>
                        </section>
                      </div>
                    )}

                    {currentArticle.sources.length > 0 && articleSubTab === 'content' && (
                      <div className="pt-6 border-t border-slate-100">
                        <p className="text-[10px] font-bold text-slate-400 mb-3 tracking-tight">Източници и Цитати</p>
                        <div className="grid grid-cols-2 gap-4">
                          {currentArticle.sources.map((source, idx) => (
                            <a 
                              key={idx} 
                              href={source.url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100 hover:bg-white hover:shadow-sm transition-all group"
                            >
                              <span className="text-xs text-slate-600 font-medium truncate flex-1">{source.title}</span>
                              <ExternalLink size={12} className="text-slate-400 group-hover:text-blue-600" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'archive' && (
            <motion.div 
               key="archive"
               initial={{ opacity: 0, x: 20 }}
               animate={{ opacity: 1, x: 0 }}
               exit={{ opacity: 0, x: -20 }}
               className="max-w-5xl mx-auto space-y-6"
            >
              <header className="flex items-center justify-between">
                <div>
                  <h2 className="text-3xl font-semibold text-slate-900 dark:text-slate-100 mb-2">Архив на статиите</h2>
                  <p className="text-slate-500 dark:text-slate-400">Вашият списък от генерирани и запазени версии.</p>
                </div>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {versions.length === 0 ? (
                  <div className="col-span-full py-20 text-center bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-300 dark:border-slate-700 transition-colors duration-300">
                    <FileText size={48} className="mx-auto text-slate-200 dark:text-slate-800 mb-4" />
                    <p className="text-slate-400 font-medium">Няма открити статии в архива.</p>
                  </div>
                ) : (
                  versions.map((v) => (
                    <div key={v.id} className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 hover:shadow-md transition-all group flex flex-col">
                      <div className="flex items-start justify-between mb-3">
                        <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400">
                          <FileText size={20} />
                        </div>
                        <button 
                          onClick={() => setVersions(versions.filter(ver => ver.id !== v.id))}
                          className="p-1.5 text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <h4 className="font-semibold text-slate-800 dark:text-slate-100 line-clamp-2 mb-2">{v.title}</h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-3 mb-4 flex-1">{v.metaDescription}</p>
                      <div className="flex items-center justify-between pt-4 border-t border-slate-50 dark:border-slate-800">
                        <span className="text-[10px] text-slate-400 font-mono">
                          {new Date(v.createdAt).toLocaleDateString('bg-BG')}
                        </span>
                        <button 
                          onClick={() => { setCurrentArticle(v); setActiveTab('generator'); }}
                          className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                        >
                          Преглед <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'analysis' && (
            <motion.div 
              key="analysis"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-5xl mx-auto space-y-8"
            >
              <header className="flex items-center justify-between">
                <div>
                  <h2 className="text-3xl font-semibold text-slate-900 dark:text-slate-100 mb-2">Проверка & Анализ</h2>
                  <p className="text-slate-500 dark:text-slate-400">Проверете Вашата статия за фактологични грешки, SEO и граматика.</p>
                </div>
                {currentArticle && (
                  <button 
                    onClick={() => { setCurrentArticle(null); setAnalysisResult(null); setManualText(''); }}
                    className="flex items-center gap-2 text-sm font-bold text-blue-600 hover:text-blue-700 bg-blue-50 dark:bg-blue-900/30 px-4 py-2 rounded-xl transition-all"
                  >
                    <PlusCircle size={18} />
                    Нова проверка
                  </button>
                )}
              </header>

              {!currentArticle && !analysisResult ? (
                <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-800 space-y-6">
                  <div className="space-y-4">
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">Поставете Вашия текст за анализ</label>
                    <textarea 
                      value={manualText}
                      onChange={(e) => setManualText(e.target.value)}
                      placeholder="Въведете статията тук, за да я проверим за грешки..."
                      className="w-full min-h-[400px] p-6 rounded-2xl border-2 border-slate-100 dark:border-slate-800 focus:border-blue-500 dark:focus:border-blue-400 outline-none transition-all font-mono text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                    />
                  </div>
                  <button 
                    onClick={() => handleAnalyze(manualText)}
                    disabled={isAnalyzing || !manualText}
                    className="w-full py-4 bg-blue-600 text-white rounded-2xl font-semibold flex items-center justify-center gap-3 hover:bg-blue-700 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed normal-case"
                  >
                    {isAnalyzing ? <Loader2 size={24} className="animate-spin" /> : <ShieldCheck size={24} />}
                    Анализирай и провери за грешки
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="col-span-1 space-y-6">
                    <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 text-center shadow-sm relative overflow-hidden transition-colors duration-300">
                      <div className="absolute top-0 left-0 w-full h-1 bg-blue-600"></div>
                      <p className="text-sm font-semibold text-slate-500 mb-4 tracking-wider">Качество & SEO</p>
                      <div className="relative w-32 h-32 mx-auto mb-4">
                        <svg className="w-full h-full transform -rotate-90">
                          <circle cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-slate-100 dark:text-slate-800" />
                          <circle 
                            cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="8" fill="transparent" 
                            strokeDasharray={364.42} 
                            strokeDashoffset={analysisResult ? 364.42 * (1 - analysisResult.score / 100) : 364.42}
                            className="text-blue-600 transition-all duration-1000" 
                          />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-3xl font-bold text-slate-800 dark:text-slate-100">{analysisResult?.score || 0}%</span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden transition-colors duration-300">
                      <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500"></div>
                      <div className="flex items-center gap-2 mb-4">
                        <ShieldCheck size={20} className="text-emerald-500" />
                        <h4 className="font-bold text-slate-800 dark:text-slate-100 text-sm">Оригиналност</h4>
                      </div>
                      <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full mb-3">
                        <div 
                          className={cn(
                            "h-full rounded-full transition-all duration-1000",
                            (analysisResult?.plagiarismScore || 0) < 60 ? "bg-red-500" : (analysisResult?.plagiarismScore || 0) < 85 ? "bg-amber-500" : "bg-emerald-500"
                          )} 
                          style={{ width: `${analysisResult?.plagiarismScore || 0}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
                        {analysisResult ? (
                          <>
                            Степен на оригиналност: <span className={cn("font-bold text-xs", (analysisResult.plagiarismScore < 60 ? "text-red-600" : analysisResult.plagiarismScore < 85 ? "text-amber-600" : "text-emerald-600"))}>{analysisResult.plagiarismScore}%</span>
                            <br />
                            {analysisResult.plagiarismScore < 70 ? 'ВНИМАНИЕ: Намерено е значително сходство с външни източници.' : 'Текстът изглежда оригинален.'}
                          </>
                        ) : 'В процес на проверка...'}
                      </p>
                    </div>
                  </div>

                  <div className="col-span-1 lg:col-span-2 space-y-6">
                    <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm min-h-[400px] transition-colors duration-300">
                      <h4 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-6 flex items-center gap-2">
                        Резултати от проверката
                        {isAnalyzing && <Loader2 size={18} className="animate-spin text-blue-600" />}
                      </h4>
                      {isAnalyzing ? (
                        <div className="space-y-4">
                          {[1,2,3,4].map(i => <div key={i} className="h-12 bg-slate-50 dark:bg-slate-800 animate-pulse" />)}
                        </div>
                      ) : analysisResult ? (
                        <ul className="space-y-4">
                          {analysisResult.suggestions.map((s, i) => {
                            const isError = s.includes('[Грешка]') || s.includes('[Факт]');
                            return (
                              <li key={i} className={cn(
                                "flex items-start gap-4 p-4 rounded-xl border transition-all",
                                isError 
                                  ? "bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-900/30 hover:border-red-200 dark:hover:border-red-900/50" 
                                  : "bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-900/30 hover:border-blue-200 dark:hover:border-blue-900/50"
                              )}>
                                <div className={cn(
                                  "w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold",
                                  isError ? "bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400" : "bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400"
                                )}>
                                  {i + 1}
                                </div>
                                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed font-medium">{s}</p>
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                         <div className="flex flex-col items-center justify-center h-full text-center">
                          <button 
                            onClick={() => handleAnalyze()}
                            className="px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold flex items-center gap-2 hover:bg-blue-700 transition-all font-mono"
                          >
                           Провери текущата статия
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

