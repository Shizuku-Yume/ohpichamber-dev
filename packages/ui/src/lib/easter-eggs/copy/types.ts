
export type CountedText = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };

export interface ToastLine {
  title: string;
  description: string;
}

export interface EasterEggCopy {
  draftTitle: {
    everyday: readonly string[];
    deepNight: readonly string[];
    halloween: readonly string[];
    newYearsEve: readonly string[];
    newYearsDay: readonly string[];
  };
  gitClean: {
    everyday: readonly string[];
    halloween: readonly string[];
    newYearsEve: readonly string[];
    newYearsDay: readonly string[];
  };
  push: {
    fridayEvening: readonly ToastLine[];
    smallHours: readonly ToastLine[];
  };
<<<<<<< HEAD
  /** A commit that removes clearly more lines than it adds. Titles contain `{count}`. */
||||||| bc50ba56aa
  /**
   * Said in place of "thinking" for about one block of reasoning in four.
   * Each line is a predicate like the agent status phrases: it follows the
   * model's name through `chat.statusRow.modelStatus` ("Opus is mulling it
   * over") and stands alone with a capital first letter.
   */
  thinking: readonly string[];
  /** A commit that removes clearly more lines than it adds. Titles contain `{count}`. */
=======
  thinking: readonly string[];
>>>>>>> upstream/main
  netDeletionCommit: readonly { title: CountedText; description: string }[];
}
