// ============================================================
// Centralized 400QUES WhatsApp bot message templates
// All user-facing strings live here.
// ============================================================

export function waClickLink(botNumber: string, text: string): string {
  const digits = botNumber.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export const messages = {
  welcome(name?: string | null): string {
    const head = name ? `Hello, ${name} 👋` : "Hello 👋";
    return (
      `${head}\n\n` +
      `Welcome to 400QUES 🎉\n\n` +
      `A WhatsApp questions game where you can challenge someone to answer hundreds of questions.\n\n` +
      `/start — Start a new session\n` +
      `/manage — Manage your active session\n` +
      `/help — Get help\n\n` +
      `You can also type /help anytime.`
    );
  },

  help(): string {
    return (
      `*400QUES — Help* 🎮\n\n` +
      `/start — create a new session\n` +
      `/invite — share your invite again\n` +
      `/manage — view your session\n` +
      `/status — current session state\n` +
      `/categories — browse categories\n` +
      `/cancel — cancel a pending action\n` +
      `/end — end the current session\n` +
      `/leave — leave the current session\n\n` +
      `Reply with a command anytime!`
    );
  },

  noSession(): string {
    return "Hi 👋\n\nUse /start to begin a game or /help to see available commands.";
  },

  alreadyInSession(): string {
    return (
      "You already have an active 400QUES session.\n\n" +
      "Manage or end your current session before joining another.\n\n" +
      "Send /manage to view it or /end to stop it."
    );
  },

  selfJoin(): string {
    return "You can't join your own 400QUES session.\n\nSend the invitation to someone else.";
  },

  invalidInvitation(): string {
    return "Sorry, this 400QUES invitation is invalid or has expired.\n\nAsk the session creator to generate a new invitation.";
  },

  expiredInvitation(): string {
    return "Sorry, this 400QUES invitation has expired.\n\nAsk the session creator to generate a new invitation.";
  },

  inviteExpired(code: string): string {
    return `⏰ Your invite *${code}* expired.\n\nSend /start to create a new session.`;
  },

  timedOut(minutes: number): string {
    return `⏰ The game timed out after ${minutes} minutes of inactivity.\n\nSend /start to play again!`;
  },

  sessionCreated(code: string, inviteUrl: string): string {
    return (
      `*Welcome to 400QUES!* 🎮\n\n` +
      `Your session is ready.\n\n` +
      `📌 *Invite code: ${code}*\n\n` +
      `Share this code with a friend so they can join.` +
      (inviteUrl ? `\n\nTap to send the invitation:\n${inviteUrl}` : "")
    );
  },

  inviteResent(code: string, inviteUrl: string): string {
    return (
      `📌 *Your invitation*\n\n` +
      `Session code: *${code}*\n\n` +
      (inviteUrl ? `Share this with a friend:\n\n${inviteUrl}` : "Share this code with a friend.")
    );
  },

  invitationBody(code: string): string {
    return `Join my 400QUES game 🎮\n\nSession: ${code}`;
  },

  waitingForOpponent(): string {
    return "You're waiting for someone to join your session.\n\nSend /invite to resend the invitation, or /end to cancel it.";
  },

  joined(): string {
    return "You joined the game! 🎉\n\nWaiting for the session to start...";
  },

  opponentJoined(name?: string | null): string {
    const who = name ?? "A friend";
    return `${who} joined your game! 🎉\n\nThe session is starting now.`;
  },

  bothConnected(): string {
    return "🎮 You're connected!\n\nYou are now playing 400QUES.\n\nThe session creator will choose the category.";
  },

  chooseCategory(): string {
    return "Pick a category to start with.\n\nSend /categories to see the list, or type a category name.";
  },

  opponentChoosingCategory(): string {
    return "Your opponent is choosing the category.";
  },

  categoryProposal(name: string, description: string, count: number, typeLabel: string): string {
    return (
      `🎯 Your opponent selected:\n\n` +
      `*${name}*\n\n` +
      `${description}\n\n` +
      `There are *${count}* questions available (${typeLabel}).\n\n` +
      `Would you like to play this category?`
    );
  },

  proposalSent(name: string): string {
    return `Proposal sent! Waiting for your opponent to respond to *${name}*.`;
  },

  categoryAccepted(name: string, count: number): string {
    return (
      `🎉 Category accepted!\n\n` +
      `*${name}*\n\n` +
      `There are *${count}* questions in this category.\n\n` +
      `Each round, one player picks a number.\n` +
      `The player who picks the number asks the question.\n\n` +
      `Let's play! 🎮`
    );
  },

  categoryDeclined(name: string): string {
    return `Your opponent declined *${name}*.\n\nYou can suggest another category or end the session.`;
  },

  categoryDeclinedByCreator(): string {
    return "You declined that category.\n\nYour opponent can suggest another one.";
  },

  invalidCategory(name: string): string {
    return `I could not find a category called *${name}*.\n\nSend /categories to see available categories.`;
  },

  pickNumber(count: number, playerName?: string | null): string {
    const who = playerName ? `${playerName}, ` : "";
    return (
      `🎯 Your turn!${who ? ` ${who}  \n\n` : "\n\n"}` +
      `There are *${count}* questions.\n\n` +
      `Pick an unused number from 1 to ${count}.`
    );
  },

  invalidNumber(count: number): string {
    return `Please choose an unused number between 1 and ${count}.`;
  },

  duplicateNumber(n: number): string {
    return `Number *${n}* has already been selected in this session.\n\nPick an unused number.`;
  },

  question(round: number, pickerName: string, number: number, text: string, askerName: string, answererName: string): string {
    return (
      `🎯 *ROUND ${round}*\n\n` +
      `${pickerName} picked *#${number}*.\n\n` +
      `QUESTION:\n\n` +
      `"${text}"\n\n` +
      `👤 Asking: ${askerName}\n` +
      `💬 Answering: ${answererName}`
    );
  },

  truthDareSelection(): string {
    return (
      `🔥 TRUTH OR DARE\n\n` +
      `It's your turn.\n\n` +
      `Choose one:`
    );
  },

  truthDarePicked(typeLabel: string, round: number, pickerName: string, text: string, askerName: string, answererName: string): string {
    return (
      `🔥 *${typeLabel} · ROUND ${round}*\n\n` +
      `${pickerName} chose ${typeLabel}.\n\n` +
      `${typeLabel}:\n\n` +
      `"${text}"\n\n` +
      `👤 Asking: ${askerName}\n` +
      `💬 Answering: ${answererName}`
    );
  },

  noUnusedTruth(): string {
    return "There are no unused Truth questions left in this session.";
  },

  noUnusedDare(): string {
    return "There are no unused Dare questions left in this session.";
  },

  answerRecorded(): string {
    return "Answer recorded! 🎉";
  },

  answerForward(name: string, answer: string): string {
    return `💬 ${name}'s answer:\n\n"${answer}"`;
  },

  askerWait(): string {
    return "Your opponent is answering this question.\n\nPlease wait for their response.";
  },

  notYourTurn(): string {
    return "It's not your turn right now.";
  },

  confirmEnd(): string {
    return "Are you sure you want to end this session?";
  },

  confirmLeave(): string {
    return "Are you sure you want to leave this session?";
  },

  sessionEnded(): string {
    return "This 400QUES session has ended.\n\nSend /start to play again!";
  },

  playerLeft(name: string): string {
    return `${name} left the session.\n\nThis 400QUES session has ended.\n\nSend /start to play again!`;
  },

  gameOver(turns: number, winnerName: string, winnerAsked: number): string {
    return (
      `🏁 *Game over!*\n\n` +
      `Turns played: *${turns}*\n\n` +
      `🏆 Winner: *${winnerName}* asked ${winnerAsked} questions!\n\n` +
      `Reply /start to play again, or /help for options.`
    );
  },

  exhausted(): string {
    return "🎉 You've reached the end of the available questions in this category.\n\nSend /start to play again!";
  },

  cancelPrompt(): string {
    return "There's nothing pending to cancel right now.";
  },

  mustEndSession(): string {
    return "Finish or end your current session first.";
  },

  cancelNoActiveGame(): string {
    return "You're in an active game.\n\nUse /end or /leave to stop it.";
  },

  staleAction(): string {
    return "That action is no longer active.\n\nYour session has already moved on.";
  },

  unknownCommand(): string {
    return "I don't recognize that command.\n\nUse /help to see the commands available to you.";
  },

  questionLoadError(): string {
    return "Sorry, we couldn't load that question. Please choose another number.";
  },

  genericError(): string {
    return "Something went wrong while processing that action.\n\nPlease try again.";
  },

  resume(session: {
    categoryName?: string | null;
    round: number;
    stateLabel: string;
    opponentName?: string | null;
    turnPlayerName?: string | null;
    pendingQuestion?: string | null;
  }): string {
    const lines: string[] = [];
    lines.push("Welcome back 👋");
    lines.push("");
    lines.push("You have an active 400QUES session.");
    lines.push("");
    if (session.categoryName) lines.push(`Category: ${session.categoryName}`);
    lines.push(`Round: ${session.round}`);
    lines.push(`Status: ${session.stateLabel}`);
    if (session.opponentName) lines.push(`Opponent: ${session.opponentName}`);
    if (session.stateLabel === "Waiting for your answer" && session.pendingQuestion) {
      lines.push("");
      lines.push(`Question: "${session.pendingQuestion}"`);
    }
    if (session.turnPlayerName) lines.push(`Turn: ${session.turnPlayerName}`);
    lines.push("");
    lines.push("Send /status to see the full state.");
    return lines.join("\n");
  },
};
