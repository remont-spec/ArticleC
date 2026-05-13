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
    
    8. СТРУКТУРА: Статията ТРЯБВА да има добра структура с подзаглавия. Използвай Markdown ## за основните подзаглавия и ### за по-малки секции. Всеки смислов блок трябва да започва с подзаглавие. Не пиши просто параграфи текст.
    9. ДЪЛЖИНА: Статията трябва да бъде изчерпателна, поне 600-1000 думи, освен ако темата не е много специфична.
    
    Статията трябва да бъде оптимизирана за търсачки (SEO).
    Стил на писане: ${style}.
    Трябва да върнеш резултата в JSON формат със следните полета:
    - title: Привлекателно заглавие (нормални букви, Sentence case).
    - content: Основният текст на статията (в Markdown формат). Използвай малки и големи букви правилно. ЗАДЪЛЖИТЕЛНО включи подзаглавия (## и ###) за всяка отделна секция. СЪЗДАЙ богата структура с параграфи, списъци и подзаглавия.
    - metaDescription: Описание за мета таг, оптимизирано за SEO (нормални букви). 
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
    model: "models/gemini-3-flash-preview",
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
  let data = JSON.parse(rawJson);

  // Post-processing to enforce correct case if model fails to follow instructions
  const fixCase = (text: string, isMarkdown: boolean = false) => {
    if (!text) return text;
    
    // If text is predominantly uppercase (more than 70% of letters), fix it
    const letters = text.replace(/[^a-zA-Zа-яА-Я]/g, '');
    if (letters.length > 20) {
      const upperCount = (letters.match(/[A-ZА-Я]/g) || []).length;
      if (upperCount / letters.length > 0.7) {
        if (isMarkdown) {
          // Process line by line for Markdown to preserve structure
          return text.split('\n').map(line => {
            const trimmed = line.trim();
            if (trimmed.startsWith('#')) {
              // Preserve heading hashtags and space
              const hashes = line.match(/^#+\s*/)?.[0] || '';
              const rest = line.substring(hashes.length);
              return hashes + rest.charAt(0).toUpperCase() + rest.slice(1).toLowerCase();
            }
            return line.toLowerCase().replace(/(^|[.!?]\s+)([a-zа-я])/g, (m) => m.toUpperCase());
          }).join('\n');
        }
        return text.toLowerCase().replace(/(^|[.!?]\s+)([a-zа-я])/g, (m) => m.toUpperCase());
      }
    }
    return text;
  };

  return {
    id: Math.random().toString(36).substring(7),
    topic: prompt,
    title: fixCase(data.title),
    content: fixCase(data.content, true),
    metaDescription: fixCase(data.metaDescription),
    keywords: (data.keywords || []).map((kw: string) => kw.toLowerCase()),
    imageSuggestions: (data.imageSuggestions || []).map((img: any) => ({
      ...img,
      description: fixCase(img.description)
    })),
    sources: data.sources || [],
    createdAt: Date.now(),
  };
}

export async function analyzeArticle(content: string): Promise<{ score: number; suggestions: string[]; plagiarismScore: number }> {
  const systemInstruction = `
    Анализирай предоставения текст по следните критерии:
    1. SEO Оптимизация: Провери за наситеност на ключови думи, структура и четимост.
    2. Граматически и стилови грешки: Открий правописни, пунктуационни и стилови пропуски.
    3. Информационни/Фактологични грешки: Провери дали твърденията в текста изглеждат логични и правилни.
    4. ПЛАГИАТСТВО: Използвай инструмента за Google Търсене (Google Search), за да провериш дали части от текста съществуват дословно в интернет. 
       - Потърси дословни изречения от началото, средата и края на документа.
       - Оцени процента на оригиналност. 100% означава напълно уникален текст. 0% означава напълно копиран.

    ВНИМАНИЕ: Връщай текста само с нормални малки и големи букви (Sentence case). 
    ЗАБРАНЕНО Е използването на САМО ГЛАВНИ БУКВИ (ALL CAPS).

    Върни JSON с:
    - score: Обща оценка за качество и SEO (0-100).
    - suggestions: Списък с конкретни препоръки, разделени по категории (напр. "[SEO] ...", "[Грешка] ...", "[Факт] ...").
    - plagiarismScore: Процент на ОРИГИНАЛНОСТ (0-100). Ако намериш дословни съвпадения, намали този резултат и добави източника в suggestions като "[Плагиатство] Намерено съвпадение в: [URL]".
  `;

  const response = await ai.models.generateContent({
    model: "models/gemini-3-flash-preview",
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
      },
      tools: [{ googleSearch: {} }]
    }
  });

  return JSON.parse(response.text);
}

export async function applyLayout(
  articleContent: string,
  layoutContent: string,
  instructions: string
): Promise<string> {
  const systemInstruction = `
    Ти си WordPress експерт по Gutenberg блокове.
    Твоята задача е да интегрираш съдържанието на статията в предоставения WordPress Layout (Block Pattern).
    
    ВХОДНИ ДАННИ:
    1. СЪДЪРЖАНИЕ НА СТАТИЯТА: (написано в Markdown).
    2. LAYOUT (WP BLOCKS): HTML код на WordPress блокове/патърн.
    3. ИНСТРУКЦИИ: Как точно да се използва лейаута.
    
    ПРАВИЛА:
    1. ЗАПАЗИ структурата на WordPress блоковете (<!-- wp:... -->).
    2. ЗАМЕНИ примерните текстове в лейаута със съответните части от статията.
    3. СЛЕДВАЙ стриктно допълнителните инструкции на потребителя.
    4. АКО статията е по-дълга от предвидените места в лейаута, добави допълнителни стандартни параграфи (<!-- wp:paragraph -->) в подходящи секции, за да не се губи информация.
    5. РЕЗУЛТАТЪТ трябва да бъде ЧИСТ HTML/WP Blocks код, готов за поставяне в WordPress редактора. Не добавяй обяснения извън кода.
    6. ВРЪЩАЙ САМО КОДА.
  `;

  const userPrompt = `
    СТАТИЯ:
    ${articleContent}
    
    WP LAYOUT:
    ${layoutContent}
    
    ИНСТРУКЦИИ:
    ${instructions}
  `;

  const response = await ai.models.generateContent({
    model: "models/gemini-3-flash-preview",
    contents: userPrompt,
    config: {
      systemInstruction,
    },
  });

  return response.text;
}

export async function humanizeArticle(content: string): Promise<string> {
  const systemInstruction = `
    Ти си експерт по "хуманизиране" на ИИ генерирано съдържание.
    Твоята цел е да преработиш предоставения текст така, че да звучи естествено, ангажиращо и като написано от човек, като същевременно запазиш структурата и SEO оптимизацията.

    ПРАВИЛА:
    1. ИЗБЯГВАЙ типичните ИИ клишета (напр. "В днешния динамичен свят", "Важно е да отбележим", "В заключение").
    2. ИЗПОЛЗВАЙ по-разнообразна структура на изреченията (смеси дълги и къси изречения).
    3. ДОБАВИ емоционална интелигентност и нюанси, характерни за човешкия изказ.
    4. ЗАПАЗИ Markdown форматирането (заглавия, списъци, болд).
    5. ЗАПАЗИ смисъла и фактологичната точност.
    6. РЕЗУЛТАТЪТ трябва да бъде само преработения текст в Markdown формат.
    7. ЕЗИК: Български.
    8. НЕ променяй заглавията (##, ###), само съдържанието под тях.
    9. ВРЪЩАЙ САМО ПРЕРАБОТЕНИЯ ТЕКСТ.
  `;

  const response = await ai.models.generateContent({
    model: "models/gemini-3-flash-preview",
    contents: content,
    config: {
      systemInstruction,
    },
  });

  return response.text;
}
