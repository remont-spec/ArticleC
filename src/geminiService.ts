import { GoogleGenAI, Type } from "@google/genai";
import { ArticleVersion, WritingStyle } from "./types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function generateArticle(
  prompt: string,
  style: WritingStyle,
  language: string = "Bulgarian",
  additionalContext: string = "",
  useSearch: boolean = true
): Promise<ArticleVersion> {
  const systemInstruction = `
    Ти си професионален копирайтър и SEO експерт. 
    Твоята задача е да напишеш статия на език: ${language}.
    
    КРИТИЧНИ ПРАВИЛА ЗА ФОРМАТИРАНЕ (АБСОЛЮТНО ЗАДЪЛЖИТЕЛНИ):
    1. ИЗПОЛЗВАЙ СТАНДАРТНИ БУКВИ (Sentence case). Пиши с малки и големи букви (нормален правопис), както в книга или новинарски сайт.
    2. ЗАБРАНЕНО Е ПИСАНЕТО ТАКА: "ТОВА Е ЗАГЛАВИЕ". ВМЕСТО ТОВА ПИШИ ТАКА: "Това е заглавие".
    3. ЗАБРАНЕНО Е ЦЕЛИЯТ ТЕКСТ ДА БЪДЕ САМО С ГЛАВНИ БУКВИ. ТОВА Е КРИТИЧНО.
    4. ЗАБРАНЕНО е целият текст да бъде в ПОЛУЧЕР (BOLD). Използвай bold (**текст**) само за отделни важни думи, не за цели изречения или параграфи.
    5. ПРЕРАЗКАЗВАЙ КОНТЕКСТА: Дори ако предоставените файлове, интернет търсенето (Grounding) или контекстът са написани само с главни букви, ТИ ТРЯБВА да ги преработиш и напишеш с нормални малки и големи букви.
    6. ВИНАГИ използвай малки букви за основния обем от текст, спазвайки правилата на езика за главни букви само където е необходимо.
    7. АКО ТВОЯТ ОТГОВОР СЪДЪРЖА САМО ГЛАВНИ БУКВИ, ТОВА СЕ СЧИТА ЗА КРИТИЧНА ГРЕШКА.
    
    Статията трябва да бъде оптимизирана за търсачки (SEO).
    Стил на писане: ${style}.
    Трябва да върнеш резултата в JSON формат със следните полета:
    - title: Привлекателно заглавие (нормални букви).
    - content: Основният текст на статията (в Markdown формат). Използвай малки и големи букви правилно.
    - metaDescription: Описание за мета таг, оптимизирано за SEO. 
    - keywords: Списък с ключови думи за SEO (поне 5-10).
    - imageSuggestions: Списък от обекти с { description, searchUrl }. 
      - description: Кратко описание на изображението.
      - searchUrl: Линк към Unsplash търсене въз основа на ключови думи (напр. https://unsplash.com/s/photos/keyword).
    - sources: Списък от обекти с { title, url } за използваните източници.

    АКЦЕНТИРАЙ върху Bulgarian език. Използвай ПРАВИЛНА ГРАМАТИКА и нормален регистър (МАЛКИ И ГОЛЕМИ букви).
    Ако използваш информация от предоставения контекст, цитирай я коректно.
  `;

  const userPrompt = `
    Тема/Промпт: ${prompt}
    Допълнителен контекст от документи: ${additionalContext}
  `;

  const tools: any[] = [];
  if (useSearch) {
    tools.push({ googleSearch: {} });
  }

  const response = await ai.models.generateContent({
    model: "gemini-1.5-flash",
    contents: userPrompt,
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          content: { type: Type.STRING },
          metaDescription: { type: Type.STRING },
          keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
          imageSuggestions: { 
            type: Type.ARRAY, 
            items: { 
              type: Type.OBJECT,
              properties: {
                description: { type: Type.STRING },
                searchUrl: { type: Type.STRING }
              },
              required: ["description", "searchUrl"]
            } 
          },
          sources: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                url: { type: Type.STRING },
              },
              required: ["title", "url"]
            }
          }
        },
        required: ["title", "content", "metaDescription", "keywords", "imageSuggestions", "sources"]
      },
      tools: tools.length > 0 ? tools : undefined,
    },
  });

  const rawJson = response.text;
  const data = JSON.parse(rawJson);

  return {
    id: Math.random().toString(36).substring(7),
    topic: prompt,
    title: data.title,
    content: data.content,
    metaDescription: data.metaDescription,
    keywords: data.keywords || [],
    imageSuggestions: data.imageSuggestions || [],
    sources: data.sources || [],
    createdAt: Date.now(),
  };
}

export async function analyzeArticle(content: string): Promise<{ score: number; suggestions: string[]; plagiarismScore: number }> {
  const systemInstruction = `
    Анализирай предоставения текст по следните критерии:
    1. SEO Оптимизация: Провери за наситеност на ключови думи, структура и четимост.
    2. Граматически и стилови грешки: Открий правописни, пунктуационни и стилови пропуски.
    3. Информационни/Фактологични грешки: Провери дали твърденията в текста изглеждат логични и правилни (използвай вътрешните си знания).
    4. Плагиатство: Оцени оригиналността на изказа.

    Върни JSON с:
    - score: Обща оценка за качество и SEO (0-100).
    - suggestions: Списък с конкретни препоръки, разделени по категории (напр. "[SEO] ...", "[Грешка] ...", "[Факт] ...").
    - plagiarismScore: Процент на оригиналност (0-100).
  `;

  const response = await ai.models.generateContent({
    model: "gemini-1.5-flash",
    contents: content,
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          score: { type: Type.NUMBER },
          suggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
          plagiarismScore: { type: Type.NUMBER }
        },
        required: ["score", "suggestions", "plagiarismScore"]
      }
    }
  });

  return JSON.parse(response.text);
}
