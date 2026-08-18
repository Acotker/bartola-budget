// Marketing copy for the public landing page (spec §4), adapted per direct
// user feedback: em dashes removed throughout so the copy doesn't read as
// AI-written. Meaning and tone preserved; punctuation only.

// HEADLINE UNDER TEST — swap after the five-second classmate test.
// Alternate B: "You left a paycheck to be here. Don't let money take the experience too."
// Alternate C: "Two years. One pool of money. Zero paychecks."
export const HEADLINE = "You left a paycheck to be here. Know what you can spend today.";

export const landing = {
  hero: {
    headline: HEADLINE,
    subhead:
      "One lump sum has to cover the whole program, and nothing's coming " +
      "in behind it. SIP turns that into one calm number, every day: " +
      "what's actually safe to spend. Three inputs to start. No bank " +
      "account to connect.",
    cta: "See how it works →",
  },

  demo: {
    header: "Log a $45 dinner. Watch the number move.",
    body:
      "This is the whole product. Tap to log a spend, and today's number " +
      "updates instantly, right there under 'Spent today.' No math. " +
      "No spreadsheet. No wondering what's left.",
    cta: "Start with your own numbers →",
  },

  // Demo card microcopy (spec §5.1) — not full sentences, but still locked.
  demoCard: {
    safeToSpendLabel: "Safe to spend today",
    spentTodayLabel: "Spent today",
    spentTodayInitial: "$0",
    spentTodayAfterTap: "$45",
    logButton: "Log $45 dinner",
    resetButton: "Reset",
  },

  problem: {
    paragraphs: [
      "It starts before day one, honestly. You need first, last, deposit, and a broker fee in hand weeks before the money that's supposed to cover it shows up. You figure it out. Everybody does.",
      "Then it's day 83. You get invited to a wedding back home. And you're standing there thinking: do I spend on this, or am I torching my runway?",
      "So you pass. Because you have no idea.",
      "That feeling: every coffee, every dinner, every decision. Not one big financial crisis. A hundred small ones, every single day.",
    ],
    lastParagraphLead:
      "Budgeting apps don't help here. They're autopsies. They sort last month into twelve categories and hand you a chart. That's not the question. The question is one decision, right now:",
    emphasis: "can I spend this?",
  },

  solution: {
    header: "One number. Not twelve categories.",
    bodyParagraphs: [
      "Rent, utilities, the section retreat: set aside before you see your number, for their full cost, not a slice of it. So the number is honest on day one instead of flattering you in September and collapsing in November.",
      "What's left is yours. Free and clear.",
    ],
    deltaHeader: "Before you commit to anything, you see the price in today's terms.",
    deltaBody:
      "Add the spring trek and SIP tells you, right then: your daily " +
      "goes from $82.26 to $79.96. Decide with the real number in " +
      "front of you, not after.",
  },

  forgiveness: {
    header: "Overspend? It adjusts. It doesn't punish.",
    bodyParagraphs: [
      "Go over, and tomorrow's sip quietly eases down on its own, from $83.84 to $83.79. That's it. No red banner. No 'you failed this month.' No guilt trip.",
      "Yesterday is never rewritten. SIP tells you the real number and what you can do about it. What you do with it is yours.",
    ],
  },

  secondYear: {
    header: "You didn't come here to just survive it.",
    bodyParagraphs: [
      "The real risk isn't spending money at grad school. It's spending it on the wrong things at the wrong time, and finding out in year two, when the treks and the banquet and the job search are the whole reason you came.",
      "SIP isn't about saying no. It's about knowing, today, whether you can say yes.",
    ],
    card:
      "Moved here with your person? Track one shared pool the same way: " +
      "one honest number for the both of you.",
  },

  differentiation: {
    header: "Everyone else builds for people with a paycheck.",
    axes: [
      {
        icon: "📈",
        lead: "They assume more is coming.",
        body:
          "Every budgeting app on your phone is built around a monthly " +
          "income that refills the tank. Making one of them work for a " +
          "single pool that has to last two years means manual gymnastics " +
          "every month. SIP does it natively, because it's the only thing " +
          "it does.",
      },
      {
        icon: "🏦",
        lead: "They need your bank.",
        body:
          "Most of them want you to link accounts and hand a data " +
          "aggregator a live feed of your financial life, then guess at " +
          "what your transactions meant. SIP needs three numbers: what " +
          "you've got, when it starts, when it ends. Nothing to connect. " +
          "Nothing to sync.",
      },
      {
        icon: "💸",
        lead: "They're often selling something else.",
        body:
          "A lot of 'student finance' tools make their money on " +
          "refinancing: moving federal loans into private ones, quietly " +
          "trading away federal protections. SIP doesn't sell debt " +
          "products. It's just the tool.",
      },
    ],
    mark: "This is SIP. Make it last.",
    submark: "Sip, don't gulp.",
  },

  faq: [
    {
      q: "Do I have to connect my bank?",
      a:
        "No. There's nothing to connect. You enter what you have, when it starts, " +
        "and when it ends. That's the whole setup.",
    },
    {
      q: "What if more money comes in later, like a refund, a summer internship, or help from family?",
      a: "Add it, and every number updates from that day forward. Nothing behind you changes.",
    },
    {
      q: "What if I go over?",
      a: "Tomorrow's number eases down a little. That's the entire consequence.",
    },
    {
      q: "How long does setup take?",
      a:
        "Three fields. You'll see your first real number before you've decided " +
        "whether you like it.",
    },
  ],

  finalCta: {
    header: "Ready to see your number?",
    cta: "Start with your own numbers →",
    microcopy:
      "Three fields. No bank connection. Built by two MBAs who did this " +
      "math in their heads every day.",
    emailLine: "Not ready? Leave your email and we'll tell you when there's more.",
  },
};
