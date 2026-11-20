

/**
 * What the agent is doing, shown in the status row above the composer and in
 * the scroll-to-bottom pill, merged into each locale's main dictionary.
 *
 * Each phrase is a predicate: `chat.statusRow.modelStatus` puts it after the
 * model's name ("Opus is running a command"), and without a model it stands
 * alone with its first letter capitalised ("Running a command"), so it has to
 * read well both ways. Counted phrases use ICU plural syntax,
 * `{count, plural, one {# file} other {# files}}`, with the categories the
 * locale needs (`Intl.PluralRules`); `#` becomes the number. They are shown
 * only for two or more parallel calls.
 *
 * A new status is one key here in every locale plus its mapping in
 * `hooks/useAssistantStatus.ts`; `agent-status.i18n.test.ts` checks the rest.
 */
export const agentStatusI18n = {
  en: {
  'chat.agentStatus.working': 'working',
  'chat.agentStatus.thinking': 'thinking',
  'chat.agentStatus.waitingPermission': 'waiting for permission',
  'chat.agentStatus.usingTool': 'using {name}',
  'chat.agentStatus.sessions.unlink': 'removing a link from the work',
  'chat.agentStatus.retry': 'Retrying',
  'chat.agentStatus.retry.in': 'Retrying in {time}',
  'chat.agentStatus.retry.attempt': 'Retrying · attempt {attempt} of {max}',
  'chat.agentStatus.retry.inAttempt': 'Retrying in {time} · attempt {attempt} of {max}',
  'chat.agentStatus.compacting': 'compacting the conversation'
},
  de: {
  'chat.agentStatus.working': 'arbeitet',
  'chat.agentStatus.thinking': 'denkt nach',
  'chat.agentStatus.waitingPermission': 'wartet auf Erlaubnis',
  'chat.agentStatus.usingTool': 'verwendet {name}',
  'chat.agentStatus.sessions.unlink': 'entfernt einen Link aus der Arbeit',
  'chat.agentStatus.retry': 'Neuer Versuch',
  'chat.agentStatus.retry.in': 'Neuer Versuch in {time}',
  'chat.agentStatus.retry.attempt': 'Neuer Versuch · Versuch {attempt} von {max}',
  'chat.agentStatus.retry.inAttempt': 'Neuer Versuch in {time} · Versuch {attempt} von {max}',
  'chat.agentStatus.compacting': 'komprimiert die Unterhaltung'
},
  fr: {
  'chat.agentStatus.working': 'travaille',
  'chat.agentStatus.thinking': 'réfléchit',
  'chat.agentStatus.waitingPermission': 'attend une autorisation',
  'chat.agentStatus.usingTool': 'utilise {name}',
  'chat.agentStatus.sessions.unlink': 'retire un lien du travail',
  'chat.agentStatus.retry': 'Nouvelle tentative',
  'chat.agentStatus.retry.in': 'Nouvelle tentative dans {time}',
  'chat.agentStatus.retry.attempt': 'Nouvelle tentative · essai {attempt} sur {max}',
  'chat.agentStatus.retry.inAttempt': 'Nouvelle tentative dans {time} · essai {attempt} sur {max}',
  'chat.agentStatus.compacting': 'compacte la conversation'
},
  nl: {
  'chat.agentStatus.working': 'werkt',
  'chat.agentStatus.thinking': 'denkt na',
  'chat.agentStatus.waitingPermission': 'wacht op toestemming',
  'chat.agentStatus.usingTool': 'gebruikt {name}',
  'chat.agentStatus.sessions.unlink': 'verwijdert een link uit het werk',
  'chat.agentStatus.retry': 'Opnieuw proberen',
  'chat.agentStatus.retry.in': 'Opnieuw proberen over {time}',
  'chat.agentStatus.retry.attempt': 'Opnieuw proberen · poging {attempt} van {max}',
  'chat.agentStatus.retry.inAttempt': 'Opnieuw proberen over {time} · poging {attempt} van {max}',
  'chat.agentStatus.compacting': 'kort het gesprek in'
},
  es: {
  'chat.agentStatus.working': 'trabaja',
  'chat.agentStatus.thinking': 'piensa',
  'chat.agentStatus.waitingPermission': 'espera permiso',
  'chat.agentStatus.usingTool': 'usa {name}',
  'chat.agentStatus.sessions.unlink': 'quita un enlace del trabajo',
  'chat.agentStatus.retry': 'Reintentando',
  'chat.agentStatus.retry.in': 'Reintentando en {time}',
  'chat.agentStatus.retry.attempt': 'Reintentando · intento {attempt} de {max}',
  'chat.agentStatus.retry.inAttempt': 'Reintentando en {time} · intento {attempt} de {max}',
  'chat.agentStatus.compacting': 'compacta la conversación'
},
  'pt-BR': {
  'chat.agentStatus.working': 'trabalha',
  'chat.agentStatus.thinking': 'pensa',
  'chat.agentStatus.waitingPermission': 'aguarda permissão',
  'chat.agentStatus.usingTool': 'usa {name}',
  'chat.agentStatus.sessions.unlink': 'remove um link do trabalho',
  'chat.agentStatus.retry': 'Tentando novamente',
  'chat.agentStatus.retry.in': 'Tentando novamente em {time}',
  'chat.agentStatus.retry.attempt': 'Tentando novamente · tentativa {attempt} de {max}',
  'chat.agentStatus.retry.inAttempt': 'Tentando novamente em {time} · tentativa {attempt} de {max}',
  'chat.agentStatus.compacting': 'compacta a conversa'
},
  ja: {
  'chat.agentStatus.working': '作業中',
  'chat.agentStatus.thinking': '思考中',
  'chat.agentStatus.waitingPermission': '許可待ち',
  'chat.agentStatus.usingTool': '{name}を使用中',
  'chat.agentStatus.sessions.unlink': '作業からリンクを削除中',
  'chat.agentStatus.retry': '再試行中',
  'chat.agentStatus.retry.in': '{time}後に再試行',
  'chat.agentStatus.retry.attempt': '再試行中 · {attempt}/{max} 回目',
  'chat.agentStatus.retry.inAttempt': '{time}後に再試行 · {attempt}/{max} 回目',
  'chat.agentStatus.compacting': '会話を圧縮中'
},
  ko: {
  'chat.agentStatus.working': '작업 중',
  'chat.agentStatus.thinking': '생각 중',
  'chat.agentStatus.waitingPermission': '권한 승인 대기 중',
  'chat.agentStatus.usingTool': '{name} 사용 중',
  'chat.agentStatus.sessions.unlink': '작업에서 링크 제거 중',
  'chat.agentStatus.retry': '다시 시도 중',
  'chat.agentStatus.retry.in': '{time} 후 다시 시도',
  'chat.agentStatus.retry.attempt': '다시 시도 중 · {attempt}/{max}번째 시도',
  'chat.agentStatus.retry.inAttempt': '{time} 후 다시 시도 · {attempt}/{max}번째 시도',
  'chat.agentStatus.compacting': '대화 압축 중'
},
  pl: {
  'chat.agentStatus.working': 'pracuje',
  'chat.agentStatus.thinking': 'myśli',
  'chat.agentStatus.waitingPermission': 'czeka na zgodę',
  'chat.agentStatus.usingTool': 'używa {name}',
  'chat.agentStatus.sessions.unlink': 'usuwa odnośnik z pracy',
  'chat.agentStatus.retry': 'Ponawianie próby',
  'chat.agentStatus.retry.in': 'Ponowna próba za {time}',
  'chat.agentStatus.retry.attempt': 'Ponawianie · próba {attempt} z {max}',
  'chat.agentStatus.retry.inAttempt': 'Ponowna próba za {time} · próba {attempt} z {max}',
  'chat.agentStatus.compacting': 'kompaktuje rozmowę'
},
  uk: {
  'chat.agentStatus.working': 'працює',
  'chat.agentStatus.thinking': 'думає',
  'chat.agentStatus.waitingPermission': 'чекає на дозвіл',
  'chat.agentStatus.usingTool': 'використовує {name}',
  'chat.agentStatus.sessions.unlink': 'прибирає посилання з роботи',
  'chat.agentStatus.retry': 'Повторна спроба',
  'chat.agentStatus.retry.in': 'Повторна спроба через {time}',
  'chat.agentStatus.retry.attempt': 'Повторна спроба · спроба {attempt} з {max}',
  'chat.agentStatus.retry.inAttempt': 'Повторна спроба через {time} · спроба {attempt} з {max}',
  'chat.agentStatus.compacting': 'стискає розмову'
},
  'zh-CN': {
  'chat.agentStatus.working': '正在工作',
  'chat.agentStatus.thinking': '正在思考',
  'chat.agentStatus.waitingPermission': '正在等待授权',
  'chat.agentStatus.usingTool': '正在使用{name}',
  'chat.agentStatus.sessions.unlink': '正在从工作中移除链接',
  'chat.agentStatus.retry': '正在重试',
  'chat.agentStatus.retry.in': '将在{time}后重试',
  'chat.agentStatus.retry.attempt': '正在重试 · 第 {attempt}/{max} 次尝试',
  'chat.agentStatus.retry.inAttempt': '将在{time}后重试 · 第 {attempt}/{max} 次尝试',
  'chat.agentStatus.compacting': '正在压缩对话'
},
  'zh-TW': {
  'chat.agentStatus.working': '正在工作',
  'chat.agentStatus.thinking': '正在思考',
  'chat.agentStatus.waitingPermission': '正在等待授權',
  'chat.agentStatus.usingTool': '正在使用{name}',
  'chat.agentStatus.sessions.unlink': '正在從工作中移除連結',
  'chat.agentStatus.retry': '正在重試',
  'chat.agentStatus.retry.in': '將在{time}後重試',
  'chat.agentStatus.retry.attempt': '正在重試 · 第 {attempt}/{max} 次嘗試',
  'chat.agentStatus.retry.inAttempt': '將在{time}後重試 · 第 {attempt}/{max} 次嘗試',
  'chat.agentStatus.compacting': '正在壓縮對話'
},
  tr: {
  'chat.agentStatus.working': 'çalışıyor',
  'chat.agentStatus.thinking': 'düşünüyor',
  'chat.agentStatus.waitingPermission': 'izin bekliyor',
  'chat.agentStatus.usingTool': '{name} kullanıyor',
  'chat.agentStatus.sessions.unlink': 'çalışmadan bağlantı kaldırıyor',
  'chat.agentStatus.retry': 'Yeniden deneniyor',
  'chat.agentStatus.retry.in': '{time} sonra yeniden denenecek',
  'chat.agentStatus.retry.attempt': 'Yeniden deneniyor · deneme {attempt}/{max}',
  'chat.agentStatus.retry.inAttempt': '{time} sonra yeniden denenecek · deneme {attempt}/{max}',
  'chat.agentStatus.compacting': 'sohbeti sıkıştırıyor'
},
  ar: {
  'chat.agentStatus.working': 'يعمل',
  'chat.agentStatus.thinking': 'يفكر',
  'chat.agentStatus.waitingPermission': 'ينتظر الإذن',
  'chat.agentStatus.usingTool': 'يستخدم {name}',
  'chat.agentStatus.sessions.unlink': 'يزيل رابطًا من العمل',
  'chat.agentStatus.retry': 'جار إعادة المحاولة',
  'chat.agentStatus.retry.in': 'إعادة المحاولة بعد {time}',
  'chat.agentStatus.retry.attempt': 'جار إعادة المحاولة · المحاولة {attempt} من {max}',
  'chat.agentStatus.retry.inAttempt': 'إعادة المحاولة بعد {time} · المحاولة {attempt} من {max}',
  'chat.agentStatus.compacting': 'يضغط المحادثة'
},
  he: {
  'chat.agentStatus.working': 'עובד',
  'chat.agentStatus.thinking': 'חושב',
  'chat.agentStatus.waitingPermission': 'ממתין להרשאה',
  'chat.agentStatus.usingTool': 'משתמש בכלי {name}',
  'chat.agentStatus.sessions.unlink': 'מסיר קישור מהעבודה',
  'chat.agentStatus.retry': 'מנסה שוב',
  'chat.agentStatus.retry.in': 'ניסיון נוסף בעוד {time}',
  'chat.agentStatus.retry.attempt': 'מנסה שוב · ניסיון {attempt} מתוך {max}',
  'chat.agentStatus.retry.inAttempt': 'ניסיון נוסף בעוד {time} · ניסיון {attempt} מתוך {max}',
  'chat.agentStatus.compacting': 'דוחס את השיחה'
}
} as const;
