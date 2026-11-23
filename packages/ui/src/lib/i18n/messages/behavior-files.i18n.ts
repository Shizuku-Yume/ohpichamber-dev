const keys = ["settings.behavior.files.title", "settings.behavior.files.rules", "settings.behavior.files.choose", "settings.behavior.files.listHint", "settings.behavior.files.delete", "settings.behavior.files.loadFailed", "settings.behavior.files.instructions"] as const;

export const behaviorFilesI18n = {
  "en": messages("Native behavior files", "Scoped rules", "Select a file", "Enter a JSON string or an array of strings.", "Delete this file from disk?", "Native behavior files could not be loaded.", "Instructions"),
  "de": messages("Native Verhaltensdateien", "Bereichsregeln", "Datei auswählen", "Eine JSON-Zeichenkette oder ein Array von Zeichenketten eingeben.", "Diese Datei vom Datenträger löschen?", "Native Verhaltensdateien konnten nicht geladen werden.", "Anweisungen"),
  "es": messages("Archivos nativos de comportamiento", "Reglas con ámbito", "Selecciona un archivo", "Introduce una cadena JSON o una lista de cadenas.", "¿Eliminar este archivo del disco?", "No se pudieron cargar los archivos nativos de comportamiento.", "Instrucciones"),
  "fr": messages("Fichiers de comportement natifs", "Règles à portée définie", "Sélectionner un fichier", "Saisissez une chaîne JSON ou un tableau de chaînes.", "Supprimer ce fichier du disque ?", "Impossible de charger les fichiers de comportement natifs.", "Instructions"),
  "pt-BR": messages("Arquivos nativos de comportamento", "Regras com escopo", "Selecione um arquivo", "Insira uma string JSON ou uma lista de strings.", "Excluir este arquivo do disco?", "Não foi possível carregar os arquivos nativos de comportamento.", "Instruções"),
  "pl": messages("Natywne pliki zachowania", "Reguły o określonym zakresie", "Wybierz plik", "Wpisz ciąg JSON lub tablicę ciągów.", "Usunąć ten plik z dysku?", "Nie udało się wczytać natywnych plików zachowania.", "Instrukcje"),
  "nl": messages("Native gedragsbestanden", "Regels met bereik", "Selecteer een bestand", "Voer een JSON-tekenreeks of een lijst van tekenreeksen in.", "Dit bestand van de schijf verwijderen?", "De native gedragsbestanden konden niet worden geladen.", "Instructies"),
  "tr": messages("Yerel davranış dosyaları", "Kapsamlı kurallar", "Bir dosya seçin", "Bir JSON dizesi veya dize dizisi girin.", "Bu dosya diskten silinsin mi?", "Yerel davranış dosyaları yüklenemedi.", "Talimatlar"),
  "uk": messages("Власні файли поведінки", "Правила з визначеною областю дії", "Виберіть файл", "Введіть рядок JSON або масив рядків.", "Видалити цей файл із диска?", "Не вдалося завантажити власні файли поведінки.", "Інструкції"),
  "ar": messages("ملفات السلوك الأصلية", "قواعد محددة النطاق", "اختر ملفًا", "أدخل سلسلة JSON أو مصفوفة من السلاسل.", "حذف هذا الملف من القرص؟", "تعذّر تحميل ملفات السلوك الأصلية.", "التعليمات"),
  "he": messages("קובצי התנהגות מקוריים", "כללים לפי תחום", "בחירת קובץ", "יש להזין מחרוזת JSON או מערך מחרוזות.", "למחוק את הקובץ מהדיסק?", "לא ניתן לטעון את קובצי ההתנהגות המקוריים.", "הוראות"),
  "ja": messages("ネイティブの動作ファイル", "スコープ付きルール", "ファイルを選択", "JSON 文字列または文字列の配列を入力してください。", "このファイルをディスクから削除しますか？", "ネイティブの動作ファイルを読み込めませんでした。", "指示"),
  "ko": messages("네이티브 동작 파일", "범위 지정 규칙", "파일 선택", "JSON 문자열 또는 문자열 배열을 입력하세요.", "디스크에서 이 파일을 삭제하시겠습니까?", "네이티브 동작 파일을 불러오지 못했습니다.", "지침"),
  "zh-CN": messages("原生行为文件", "作用域规则", "选择文件", "输入 JSON 字符串或字符串数组。", "从磁盘删除此文件？", "无法加载原生行为文件。", "指令"),
  "zh-TW": messages("原生行為檔案", "範圍規則", "選擇檔案", "輸入 JSON 字串或字串陣列。", "要從磁碟刪除此檔案嗎？", "無法載入原生行為檔案。", "指令"),
};

type Translations<T extends readonly string[]> = { [I in keyof T]: string };

function messages(...values: Translations<typeof keys>): Record<typeof keys[number], string> {
  return Object.fromEntries(keys.map((key, index) => [key, values[index]])) as Record<typeof keys[number], string>;
}
