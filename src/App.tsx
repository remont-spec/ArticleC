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
  XCircle
} from 'lucide-react';
import { ArticleVersion, ExtractedInfo, WritingStyle } from './types';
import { generateArticle, analyzeArticle } from './geminiService';
import ReactMarkdown from 'react-markdown';
import Highlighter from 'react-highlight-words';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

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
  const [extractedDocs, setExtractedDocs] = useState<ExtractedInfo[]>([]);
  const [analysisResult, setAnalysisResult] = useState<{ score: number; suggestions: string[]; plagiarismScore: number } | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [articleSubTab, setArticleSubTab] = useState<'content' | 'seo'>('content');
  const [manualText, setManualText] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

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
      setAnalysisResult(res);
      setActiveTab('analysis');
    } catch (error) {
      console.error(error);
      alert('Възникна грешка при анализа.');
    } finally {
      setIsAnalyzing(false);
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

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col">
        <div className="p-6 border-bottom border-slate-100 flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
            <FileText size={24} />
          </div>
          <h1 className="font-bold text-xl text-slate-800 tracking-tight">ArticleC</h1>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1">
          <button 
            onClick={() => setActiveTab('generator')}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all font-medium text-sm",
              activeTab === 'generator' ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:bg-slate-50"
            )}
          >
            <PlusCircle size={20} />
            Генератор
          </button>
          <button 
            onClick={() => setActiveTab('archive')}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all font-medium text-sm",
              activeTab === 'archive' ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:bg-slate-50"
            )}
          >
            <History size={20} />
            Архив
          </button>
          <button 
            onClick={() => setActiveTab('analysis')}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all font-medium text-sm",
              activeTab === 'analysis' ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:bg-slate-50"
            )}
          >
            <BarChart3 size={20} />
            Проверка & Анализ
          </button>
        </nav>

        <div className="p-4 border-t border-slate-100">
          {deferredPrompt && (
            <button 
              onClick={handleInstallClick}
              className="w-full flex items-center gap-3 px-4 py-3 mb-4 rounded-lg bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 transition-all shadow-md shadow-blue-100"
            >
              <Download size={18} />
              Инсталирай като Ап
            </button>
          )}
          <div className="p-3 bg-slate-50 rounded-lg">
            <p className="text-[10px] font-bold text-slate-400 mb-2 tracking-tight">Източници</p>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer hover:text-blue-600 transition-colors">
                <CloudUpload size={14} />
                <span>Качи файлове (PDF/DOCX)</span>
                <input type="file" multiple hidden onChange={handleFileUpload} accept=".pdf,.docx,.txt" />
              </label>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {extractedDocs.map((doc, idx) => (
                  <div key={idx} className="flex items-center justify-between text-[11px] bg-white p-1.5 rounded border border-slate-200">
                    <span className="truncate flex-1">{doc.name}</span>
                    <button onClick={() => setExtractedDocs(extractedDocs.filter((_, i) => i !== idx))} className="text-slate-400 hover:text-red-500">
                      <Trash2 size={10} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-slate-50 p-8">
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
                <h2 className="text-3xl font-bold text-slate-900 mb-2">Напишете Вашата Статия</h2>
                <p className="text-slate-500">Използвайте изкуствен интелект за създаване на качествено съдържание.</p>
              </header>

              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-6">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Тема или Промпт</label>
                  <textarea 
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Напр.: Предимствата на здравословното хранене за продуктивността..."
                    className="w-full h-32 p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none resize-none text-slate-800"
                  />
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Стил на писане</label>
                    <select 
                      value={style}
                      onChange={(e) => setStyle(e.target.value as WritingStyle)}
                      className="w-full p-3 rounded-lg border border-slate-200 text-slate-700 focus:ring-2 focus:ring-blue-500 transition-all outline-none bg-white"
                    >
                      <option value="formal">Официален</option>
                      <option value="informal">Неофициален / Блог</option>
                      <option value="academic">Академичен</option>
                      <option value="creative">Креативен / Художествен</option>
                      <option value="technical">Технически</option>
                    </select>
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors flex-1">
                      <input 
                        type="checkbox" 
                        checked={useSearch}
                        onChange={(e) => setUseSearch(e.target.checked)}
                        className="w-4 h-4 text-blue-600 rounded"
                      />
                      <span className="text-sm font-medium text-slate-700">Търсене в интернет (Grounding)</span>
                      <Search size={16} className="text-slate-400 ml-auto" />
                    </label>
                  </div>
                </div>

                <button 
                  onClick={handleGenerate}
                  disabled={isGenerating || !prompt}
                  className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-100"
                >
                  {isGenerating ? <Loader2 size={24} className="animate-spin" /> : <PlusCircle size={20} />}
                  Генерирай Статия
                </button>
              </div>

              {currentArticle && (
                <div className="bg-white p-8 rounded-2xl shadow-md border border-slate-200 space-y-6">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                    <div>
                      <h3 className="text-xl font-medium text-slate-900">{currentArticle.title}</h3>
                      <p className="text-xs text-slate-400 font-mono mt-1">Версия ID: {currentArticle.id}</p>
                    </div>
                    <div className="flex gap-2">
                      {!isEditing ? (
                        <button onClick={startEditing} className="p-2 text-slate-500 hover:bg-blue-50 hover:text-blue-600 rounded-lg transition-colors border border-slate-100" title="Редактирай">
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
                       <button onClick={exportCSV} className="p-2 text-slate-500 hover:bg-blue-50 hover:text-blue-600 rounded-lg transition-colors border border-slate-100" title="Експорт като CSV">
                        <FileDown size={20} />
                      </button>
                      <button onClick={exportTxt} className="p-2 text-slate-500 hover:bg-blue-50 hover:text-blue-600 rounded-lg transition-colors border border-slate-100" title="Експорт като TXT">
                        <Download size={20} />
                      </button>
                      <button onClick={() => handleAnalyze()} className="p-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-all shadow-sm" title="Анализ на статията">
                        <BarChart3 size={20} />
                      </button>
                    </div>
                  </div>

                  <div className="flex border-b border-slate-100 px-2">
                    <button 
                      onClick={() => setArticleSubTab('content')}
                      className={cn(
                        "px-4 py-2 text-xs font-semibold tracking-wider transition-all border-b-2",
                        articleSubTab === 'content' ? "border-blue-600 text-blue-600" : "border-transparent text-slate-400 hover:text-slate-600"
                      )}
                    >
                      Съдържание
                    </button>
                    <button 
                      onClick={() => setArticleSubTab('seo')}
                      className={cn(
                        "px-4 py-2 text-xs font-semibold tracking-wider transition-all border-b-2",
                        articleSubTab === 'seo' ? "border-blue-600 text-blue-600" : "border-transparent text-slate-400 hover:text-slate-600"
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
                            className="bg-transparent border-none outline-none text-sm w-full py-1 text-slate-700 placeholder:text-slate-400"
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

                        <div className="prose prose-slate max-w-none normal-case font-normal text-slate-700">
                          {isEditing ? (
                            <textarea 
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              className="w-full min-h-[500px] p-6 rounded-xl border-2 border-blue-100 focus:border-blue-500 outline-none transition-all font-mono text-sm leading-relaxed normal-case"
                            />
                          ) : (
                            <ReactMarkdown
                              components={{
                                p: ({ children }) => <p>{highlightTerms(children, searchTerm)}</p>,
                                h1: ({ children }) => <h1>{highlightTerms(children, searchTerm)}</h1>,
                                h2: ({ children }) => <h2>{highlightTerms(children, searchTerm)}</h2>,
                                h3: ({ children }) => <h3>{highlightTerms(children, searchTerm)}</h3>,
                                li: ({ children }) => <li>{highlightTerms(children, searchTerm)}</li>,
                                strong: ({ children }) => <strong>{highlightTerms(children, searchTerm)}</strong>,
                                em: ({ children }) => <em>{highlightTerms(children, searchTerm)}</em>
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
                              <p className="text-sm text-slate-700 leading-relaxed">{currentArticle.metaDescription}</p>
                            </div>
                            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                              <p className="text-[10px] font-bold text-slate-400 mb-2 tracking-tight">Ключови думи</p>
                              <div className="flex flex-wrap gap-2">
                                {currentArticle.keywords?.map((kw, i) => (
                                  <span key={i} className="px-2 py-1 bg-white border border-slate-200 rounded text-[11px] font-medium text-slate-600">
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
                                  <p className="text-sm text-slate-600 italic">"{typeof suggestion === 'string' ? suggestion : suggestion.description}"</p>
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
                              <span className="text-xs font-medium text-slate-700 truncate mr-2">{source.title}</span>
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
                  <h2 className="text-3xl font-bold text-slate-900 mb-2">Архив на статиите</h2>
                  <p className="text-slate-500">Вашият списък от генерирани и запазени версии.</p>
                </div>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {versions.length === 0 ? (
                  <div className="col-span-full py-20 text-center bg-white rounded-3xl border border-dashed border-slate-300">
                    <FileText size={48} className="mx-auto text-slate-200 mb-4" />
                    <p className="text-slate-400 font-medium">Няма открити статии в архива.</p>
                  </div>
                ) : (
                  versions.map((v) => (
                    <div key={v.id} className="bg-white p-5 rounded-2xl border border-slate-200 hover:shadow-md transition-all group flex flex-col">
                      <div className="flex items-start justify-between mb-3">
                        <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center text-slate-500">
                          <FileText size={20} />
                        </div>
                        <button 
                          onClick={() => setVersions(versions.filter(ver => ver.id !== v.id))}
                          className="p-1.5 text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <h4 className="font-semibold text-slate-800 line-clamp-2 mb-2">{v.title}</h4>
                      <p className="text-xs text-slate-500 line-clamp-3 mb-4 flex-1">{v.metaDescription}</p>
                      <div className="flex items-center justify-between pt-4 border-t border-slate-50">
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
                  <h2 className="text-3xl font-bold text-slate-900 mb-2">Проверка & Анализ</h2>
                  <p className="text-slate-500">Проверете Вашата статия за фактологични грешки, SEO и граматика.</p>
                </div>
                {currentArticle && (
                  <button 
                    onClick={() => { setCurrentArticle(null); setAnalysisResult(null); setManualText(''); }}
                    className="flex items-center gap-2 text-sm font-bold text-blue-600 hover:text-blue-700 bg-blue-50 px-4 py-2 rounded-xl transition-all"
                  >
                    <PlusCircle size={18} />
                    Нова проверка
                  </button>
                )}
              </header>

              {!currentArticle && !analysisResult ? (
                <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100 space-y-6">
                  <div className="space-y-4">
                    <label className="block text-sm font-bold text-slate-700">Поставете Вашия текст за анализ</label>
                    <textarea 
                      value={manualText}
                      onChange={(e) => setManualText(e.target.value)}
                      placeholder="Въведете статията тук, за да я проверим за грешки..."
                      className="w-full min-h-[400px] p-6 rounded-2xl border-2 border-slate-100 focus:border-blue-500 outline-none transition-all font-mono text-sm"
                    />
                  </div>
                  <button 
                    onClick={() => handleAnalyze(manualText)}
                    disabled={isAnalyzing || !manualText}
                    className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-blue-700 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isAnalyzing ? <Loader2 size={24} className="animate-spin" /> : <ShieldCheck size={24} />}
                    Анализирай и провери за грешки
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="col-span-1 space-y-6">
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 text-center shadow-sm relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-full h-1 bg-blue-600"></div>
                      <p className="text-sm font-semibold text-slate-500 mb-4 uppercase tracking-wider">Качество & SEO</p>
                      <div className="relative w-32 h-32 mx-auto mb-4">
                        <svg className="w-full h-full transform -rotate-90">
                          <circle cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-slate-100" />
                          <circle 
                            cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="8" fill="transparent" 
                            strokeDasharray={364.42} 
                            strokeDashoffset={analysisResult ? 364.42 * (1 - analysisResult.score / 100) : 364.42}
                            className="text-blue-600 transition-all duration-1000" 
                          />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-3xl font-bold text-slate-800">{analysisResult?.score || 0}%</span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500"></div>
                      <div className="flex items-center gap-2 mb-4">
                        <ShieldCheck size={20} className="text-emerald-500" />
                        <h4 className="font-bold text-slate-800 text-sm">Оригиналност</h4>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full mb-3">
                        <div 
                          className="h-full bg-emerald-500 rounded-full transition-all duration-1000" 
                          style={{ width: `${analysisResult?.plagiarismScore || 0}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
                        {analysisResult ? `Изчислена степен на оригиналност: ${analysisResult.plagiarismScore}%` : 'В процес на проверка...'}
                      </p>
                    </div>
                  </div>

                  <div className="col-span-1 lg:col-span-2 space-y-6">
                    <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm min-h-[400px]">
                      <h4 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                        Резултати от проверката
                        {isAnalyzing && <Loader2 size={18} className="animate-spin text-blue-600" />}
                      </h4>
                      {isAnalyzing ? (
                        <div className="space-y-4">
                          {[1,2,3,4].map(i => <div key={i} className="h-12 bg-slate-50 rounded-lg animate-pulse" />)}
                        </div>
                      ) : analysisResult ? (
                        <ul className="space-y-4">
                          {analysisResult.suggestions.map((s, i) => {
                            const isError = s.includes('[Грешка]') || s.includes('[Факт]');
                            return (
                              <li key={i} className={cn(
                                "flex items-start gap-4 p-4 rounded-xl border transition-all",
                                isError ? "bg-red-50 border-red-100 hover:border-red-200" : "bg-blue-50 border-blue-100 hover:border-blue-200"
                              )}>
                                <div className={cn(
                                  "w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold",
                                  isError ? "bg-red-100 text-red-600" : "bg-blue-100 text-blue-600"
                                )}>
                                  {i + 1}
                                </div>
                                <p className="text-sm text-slate-700 leading-relaxed font-medium">{s}</p>
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                         <div className="flex flex-col items-center justify-center h-full text-center">
                          <button 
                            onClick={() => handleAnalyze()}
                            className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold flex items-center gap-2 hover:bg-blue-700 transition-all font-mono"
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

