// ============================================================================
// Seed script — creates the fictional "Meridian Realty Group" tenant with
// demo users, leads, referral-partner companies, knowledge base entries, and
// pre-built pipeline data (messages + replies) so every dashboard screen
// has interesting data from the moment you log in.
//
// Safe to re-run: wipes and recreates the demo tenant (identified by tenant
// name) rather than appending duplicates. ON DELETE CASCADE handles cleanup.
//
// Usage:
//   npm run seed
// ============================================================================

require("dotenv").config();
const bcrypt = require("bcryptjs");
const db = require("../src/db/client");
const { createTenant } = require("../src/db/repositories/tenants");
const { createUser } = require("../src/db/repositories/users");
const { createCompany } = require("../src/db/repositories/companies");
const { createLead } = require("../src/db/repositories/leads");
const { createEntry } = require("../src/db/repositories/knowledgeBase");
const { createMessage, approveMessage, markMessageSent } = require("../src/db/repositories/messages");
const { createReply } = require("../src/db/repositories/replies");
const { logAgentRun } = require("../src/db/repositories/agentLogs");

const DEMO_TENANT_NAME = "Meridian Realty Group";

function resetDemoTenant() {
  const existing = db
    .prepare(`SELECT id FROM tenants WHERE name = ?`)
    .get(DEMO_TENANT_NAME);
  if (existing) {
    // ON DELETE CASCADE handles every dependent row in one statement.
    // This also serves as a live regression test for cascade wiring.
    db.prepare(`DELETE FROM tenants WHERE id = ?`).run(existing.id);
    console.log(`Removed existing "${DEMO_TENANT_NAME}" tenant and all its data.`);
  }
}

function seed() {
  resetDemoTenant();

  // ---- Tenant + users -------------------------------------------------------

  const tenant = createTenant({ name: DEMO_TENANT_NAME, industry: "real_estate", plan: "pro" });
  console.log(`\nCreated tenant: ${tenant.name} (${tenant.id})`);

  const passwordHash = bcrypt.hashSync("demo-password-123", 10);
  const admin = createUser({
    tenantId: tenant.id,
    email: "admin@meridianrealty.test",
    passwordHash,
    name: "Priya Shah",
    role: "admin",
  });
  const agent = createUser({
    tenantId: tenant.id,
    email: "agent@meridianrealty.test",
    passwordHash,
    name: "Marcus Bell",
    role: "member",
  });
  console.log(`Created users: ${admin.email} (admin), ${agent.email} (member)`);

  // ---- Companies (referral partners only — homeowner leads have no company) --

  const titleCo = createCompany({
    tenantId: tenant.id,
    name: "Harborview Title & Escrow",
    domain: "harborviewtitle.test",
    industry: "title_insurance",
    size: "11-50",
  });
  const mortgageCo = createCompany({
    tenantId: tenant.id,
    name: "Cascade Mortgage Partners",
    domain: "cascademortgage.test",
    industry: "mortgage_brokerage",
    size: "1-10",
  });
  const inspectionCo = createCompany({
    tenantId: tenant.id,
    name: "Clearview Home Inspections",
    domain: "clearviewinspect.test",
    industry: "home_inspection",
    size: "1-10",
  });
  console.log(`Created 3 referral-partner companies.`);

  // ---- Leads — 14 leads across every status and type ------------------------
  // Realistic Meridian Realty Group scenarios: Lakewood metro area (fictional)

  const leads = [
    // ── new (pipeline not yet started) ────────────────────────────────────────
    createLead({
      tenantId: tenant.id,
      name: "Alex Rivera",
      email: "alex.rivera@example.test",
      phone: "555-0101",
      title: "Homeowner",
      leadType: "seller",
      source: "form",
      status: "new",
      notes:
        "Listed a 3-bed / 2-bath in the Fremont neighborhood 2 weeks ago via a competitor. " +
        "Low showing traffic so far. Listed at $415k — comps suggest $395-405k.",
    }),
    createLead({
      tenantId: tenant.id,
      name: "Jordan Patel",
      email: "jordan.patel@example.test",
      phone: "555-0103",
      title: "Prospective Buyer",
      leadType: "buyer",
      source: "form",
      status: "new",
      notes:
        "Pre-approved up to $480k. Looking in the Lakewood school district, 3+ bedrooms. " +
        "Has 2 young kids, wants to move before fall semester starts.",
    }),
    createLead({
      tenantId: tenant.id,
      name: "Simone Obi",
      email: "simone.obi@example.test",
      phone: "555-0110",
      title: "Homeowner",
      leadType: "expired_listing",
      source: "mls_import",
      status: "new",
      notes:
        "Condo listing expired after 90 days on market. " +
        "Originally listed at $329k — market has softened to ~$305k range. " +
        "Likely priced too high; photos also look dated in the listing.",
    }),

    // ── researching ──────────────────────────────────────────────────────────
    createLead({
      tenantId: tenant.id,
      name: "Dana Whitfield",
      email: "dana.whitfield@example.test",
      phone: "555-0102",
      title: "Homeowner",
      leadType: "expired_listing",
      source: "csv_import",
      status: "researching",
      notes:
        "4-bed colonial in Westbrook, listing expired 6 weeks ago, no relist. " +
        "Off-market pricing was $580k — most recents sales in area at $540-555k. " +
        "Owner is a remote worker, motivated but not desperate.",
    }),
    createLead({
      tenantId: tenant.id,
      name: "Felix Huang",
      email: "felix.huang@example.test",
      phone: "555-0111",
      title: "Homeowner / Investor",
      leadType: "seller",
      source: "referral",
      status: "researching",
      notes:
        "Inherited property — a 2-bed ranch that needs light cosmetic work. " +
        "Wants a fast close over maximum price. Referred by past client Robin Kessler.",
    }),

    // ── drafted ──────────────────────────────────────────────────────────────
    createLead({
      tenantId: tenant.id,
      name: "Morgan Lee",
      email: "morgan.lee@example.test",
      phone: "555-0104",
      title: "Homeowner",
      leadType: "seller",
      source: "manual",
      status: "drafted",
      notes:
        "Downsizing now that kids are grown — 4-bed house, wants to move to a condo. " +
        "Flexible timeline (3-6 months), no rush. Curious about pricing, open to conversation.",
    }),
    createLead({
      tenantId: tenant.id,
      name: "Avery Moss",
      email: "avery.moss@example.test",
      phone: "555-0112",
      title: "Prospective Buyer",
      leadType: "buyer",
      source: "open_house",
      status: "drafted",
      notes:
        "Attended two Meridian open houses in Q1. Pre-approved up to $550k. " +
        "Moving from out of state — needs a school-zone map and neighborhood guide.",
    }),

    // ── sent ─────────────────────────────────────────────────────────────────
    createLead({
      tenantId: tenant.id,
      companyId: titleCo.id,
      name: "Sam Okafor",
      email: "sam.okafor@harborviewtitle.test",
      title: "Senior Escrow Officer",
      leadType: "referral_partner",
      source: "manual",
      status: "sent",
      notes:
        "Closes transactions with 4-5 local agents monthly. A referral partnership " +
        "would mean shared close schedules and potential co-marketing. " +
        "Warm contact — met at a broker open event.",
    }),
    createLead({
      tenantId: tenant.id,
      name: "Isabelle Vega",
      email: "isabelle.vega@example.test",
      phone: "555-0113",
      title: "Homeowner",
      leadType: "expired_listing",
      source: "mls_import",
      status: "sent",
      notes:
        "Townhouse expired last month. Good photos, decent price — main issue was " +
        "limited open house availability and few weekend slots.",
    }),

    // ── replied ──────────────────────────────────────────────────────────────
    createLead({
      tenantId: tenant.id,
      companyId: mortgageCo.id,
      name: "Taylor Nguyen",
      email: "taylor.nguyen@cascademortgage.test",
      title: "Senior Loan Officer",
      leadType: "referral_partner",
      source: "manual",
      status: "replied",
      notes:
        "Warm intro from past client. Does 15-20 purchase loans per month locally. " +
        "Replied positively — interested in co-hosting a first-time buyer seminar.",
    }),

    // ── hot ──────────────────────────────────────────────────────────────────
    createLead({
      tenantId: tenant.id,
      name: "Chris Delgado",
      email: "chris.delgado@example.test",
      phone: "555-0107",
      title: "Homeowner",
      leadType: "expired_listing",
      source: "csv_import",
      status: "hot",
      notes:
        "Expired listing — 3-bed ranch in Eastdale, 120 days on market before expiry. " +
        "Replied same day asking for a callback before the weekend. Very motivated seller.",
    }),
    createLead({
      tenantId: tenant.id,
      companyId: inspectionCo.id,
      name: "Petra Walsh",
      email: "petra.walsh@clearviewinspect.test",
      title: "Owner / Lead Inspector",
      leadType: "referral_partner",
      source: "manual",
      status: "hot",
      notes:
        "Replies to every outreach within an hour. Expressed specific interest in " +
        "a mutual-referral agreement — she refers sellers, we refer buyers needing inspections.",
    }),

    // ── closed ───────────────────────────────────────────────────────────────
    createLead({
      tenantId: tenant.id,
      name: "Robin Kessler",
      email: "robin.kessler@example.test",
      phone: "555-0108",
      title: "Homeowner (past client)",
      leadType: "buyer",
      source: "form",
      status: "closed",
      notes:
        "Closed on a 3-bed craftsman in Q2 2024 — referred Felix Huang. " +
        "Kept as a past-client record for referral tracking.",
    }),
    createLead({
      tenantId: tenant.id,
      name: "Omar Faris",
      email: "omar.faris@example.test",
      phone: "555-0114",
      title: "Homeowner (past client)",
      leadType: "seller",
      source: "manual",
      status: "closed",
      notes:
        "Sold a 4-bed in the Heights for $612k in Q3 2024 — a $22k over-ask close. " +
        "Left a 5-star review. Great case-study candidate for the pitch deck.",
    }),
  ];
  console.log(`Created ${leads.length} demo leads (covering all pipeline stages).`);

  // Index by name for easy message/reply attachment
  const byName = Object.fromEntries(leads.map((l) => [l.name, l]));

  // ---- Knowledge base — 12 entries, diverse and demo-ready -----------------
  // Mix of case studies, testimonials, objection handling, and product facts.

  const kbEntries = [
    // Expired listings
    {
      content:
        "Case study: An expired-listing outreach campaign that referenced the *specific* likely " +
        "cause of the stall (overpricing, off-season timing, or poor photos) achieved a 2x higher " +
        "callback rate than a generic 're-list with us' pitch. Personalization signals you've done " +
        "the homework — not just blasted a list.",
      tags: "case_study,expired_listings,personalization",
    },
    {
      content:
        "Case study: A homeowner whose listing had expired after 110 days re-listed with Meridian " +
        "after a single outreach email. We identified the listing was priced $28k above the nearest " +
        "comparable pending sale. After a $25k adjustment and restaging the living room, it sold in " +
        "18 days. Now used as the primary expired-listing case study in pitch materials.",
      tags: "case_study,expired_listings,pricing,staging",
    },
    {
      content:
        "Objection handling — 'We're going to wait and re-list in spring': The spring market in " +
        "Lakewood historically adds 6-10% more active inventory, which compresses average sold price " +
        "by 3-4%. Sellers who waited for spring in 2023 averaged 8 fewer days on market but $11k " +
        "lower net proceeds than Q4 sellers, once carrying costs were included.",
      tags: "objection_handling,expired_listings,timing,pricing",
    },

    // Speed to lead / sellers
    {
      content:
        "Case study: A 12-agent brokerage adopted a strict 24-hour follow-up standard for all new " +
        "listing inquiries and closed 3 additional deals per month within the first quarter — " +
        "primarily from leads that had gone cold because no one followed up within the first week.",
      tags: "case_study,speed_to_lead,seller",
    },
    {
      content:
        "Testimonial: 'The faster follow-up alone paid for itself. We stopped losing sellers to " +
        "whichever agent happened to call back first.' — Managing broker, regional agency " +
        "(anonymized for demo purposes).",
      tags: "testimonial,speed_to_lead,seller",
    },

    // Buyers
    {
      content:
        "Buyer talking point: Pre-approved buyers in the $450k-$550k range currently face an " +
        "average of 4.2 competing offers on Lakewood homes that receive more than 2 showings in the " +
        "first weekend. A same-day offer with an escalation clause and a short inspection window has " +
        "won 7 of the last 9 competitive situations our agents have handled this quarter.",
      tags: "buyer,competitive_market,offer_strategy",
    },
    {
      content:
        "Testimonial: 'We lost 3 homes before finding Meridian. They coached us through writing an " +
        "offer that got accepted the same afternoon — and it wasn't even the highest price.' " +
        "— First-time buyer, Q2 2024.",
      tags: "testimonial,buyer,offer_strategy",
    },

    // Referral partners
    {
      content:
        "Referral partner outreach — what works: Messages to title company and mortgage contacts " +
        "perform best when they lead with a *specific* current or recent mutual client or " +
        "transaction rather than a generic partnership pitch. Specificity signals the relationship " +
        "is real before the formal ask.",
      tags: "referral_partner,personalization,outreach_strategy",
    },
    {
      content:
        "Case study: Meridian's referral-partner program with Harborview Title & Escrow generated " +
        "11 co-referred transactions over 6 months after starting with a single email to the escrow " +
        "officer. Each transaction averaged 18 days faster to close than non-co-referred deals " +
        "because both sides knew each other's timelines upfront.",
      tags: "case_study,referral_partner,title_company",
    },
    {
      content:
        "Case study: Loan officer co-marketing — a joint first-time buyer seminar co-hosted with " +
        "Cascade Mortgage generated 34 attendee registrations, 9 pre-approval applications, and " +
        "closed 3 purchase transactions within 60 days. Total cost split: $400 in venue and " +
        "materials per co-host.",
      tags: "case_study,referral_partner,co_marketing,mortgage",
    },

    // Message strategy
    {
      content:
        "Message length finding: Outreach messages under 125 words consistently out-performed " +
        "longer messages when measured by reply rate. Busy loan officers and escrow staff read on " +
        "mobile between client calls — long messages get deferred and forgotten. Lead with the " +
        "single most relevant proof point; save the rest for the follow-up call.",
      tags: "outreach_strategy,message_length,referral_partner",
    },

    // Pricing / market data
    {
      content:
        "Lakewood metro market snapshot (fictional demo data): Median days-on-market has risen " +
        "from 21 to 38 over the past 12 months. Homes priced within 2% of the automated valuation " +
        "model estimate sell in an average of 19 days; homes priced more than 5% above AVM sell in " +
        "61 days and close at an average 4.1% below list. Accurate pricing is the single largest " +
        "lever on net proceeds.",
      tags: "market_data,pricing,seller,lakewood",
    },
  ];

  kbEntries.forEach((entry) =>
    createEntry({ tenantId: tenant.id, content: entry.content, tags: entry.tags })
  );
  console.log(`Created ${kbEntries.length} knowledge base entries.`);

  // ---- Pre-built messages + replies to populate every dashboard screen ------
  // These show what the system looks like after the pipeline has run.

  // 1. Morgan Lee — status: drafted — has a draft message awaiting review
  const morgan = byName["Morgan Lee"];
  const morganDraft = createMessage({
    tenantId: tenant.id,
    leadId: morgan.id,
    channel: "email",
    draftText:
      "Hi Morgan — sounds like you're thinking through the timing on downsizing, " +
      "which makes a lot of sense with where the market is right now. We recently helped " +
      "a seller in a similar situation — 4-bed, flexible timeline — close in 3 weeks by " +
      "pricing against actual pending sales rather than list prices (which are lagging " +
      "in the current market). Happy to walk through what that approach could look like " +
      "for your place, no pressure at all.",
  });
  console.log(`Created draft message for ${morgan.name} (awaiting review).`);

  // 2. Sam Okafor — status: sent — approved + sent, no reply yet
  const sam = byName["Sam Okafor"];
  const samMsg = createMessage({
    tenantId: tenant.id,
    leadId: sam.id,
    channel: "email",
    draftText:
      "Hi Sam — I noticed Harborview handles closings for several agents in the Lakewood area. " +
      "We're closing about 4-6 transactions a month and have been looking for a reliable title " +
      "partner who knows the local quirks. Would you be open to a 15-minute call to see if there's " +
      "a fit? Happy to work around your schedule.",
  });
  approveMessage(tenant.id, samMsg.id, samMsg.draft_text);
  markMessageSent(tenant.id, samMsg.id, "sim_" + samMsg.id.slice(0, 8));
  console.log(`Created sent message for ${sam.name} (no reply yet).`);

  // 3. Taylor Nguyen — status: replied — positive reply, not hot
  const taylor = byName["Taylor Nguyen"];
  const taylorMsg = createMessage({
    tenantId: tenant.id,
    leadId: taylor.id,
    channel: "email",
    draftText:
      "Hi Taylor — congrats on the Q1 volume I've been seeing. We've had a few buyers " +
      "recently who needed a strong lender referral and didn't have one yet. If you're " +
      "open to a reciprocal arrangement — you send pre-approved buyers our way, we refer " +
      "buyers without a lender to you — it might be worth a quick chat.",
  });
  approveMessage(tenant.id, taylorMsg.id, taylorMsg.draft_text);
  markMessageSent(tenant.id, taylorMsg.id, "sim_" + taylorMsg.id.slice(0, 8));
  createReply({
    tenantId: tenant.id,
    messageId: taylorMsg.id,
    content:
      "Hi — yes, I'd be interested in talking through a referral arrangement. " +
      "I have a few buyers right now who are actively looking but don't have an agent. " +
      "Are you free Thursday afternoon?",
    sentiment: "positive",
    isHotLead: false,
  });
  console.log(`Created sent message + positive reply for ${taylor.name}.`);

  // 4. Chris Delgado — status: hot — fast reply, asked for same-day call
  const chris = byName["Chris Delgado"];
  const chrisMsg = createMessage({
    tenantId: tenant.id,
    leadId: chris.id,
    channel: "email",
    draftText:
      "Hi Chris — I noticed your listing came off the market last month after 120 days. " +
      "That's a frustrating result when you've done everything right. More often than not " +
      "it comes down to a pricing mismatch with current comparables, not the home itself. " +
      "We'd be glad to take a fresh look and share exactly what we'd do differently — " +
      "no obligation, just a straight read on the market.",
  });
  approveMessage(tenant.id, chrisMsg.id, chrisMsg.draft_text);
  markMessageSent(tenant.id, chrisMsg.id, "sim_" + chrisMsg.id.slice(0, 8));
  createReply({
    tenantId: tenant.id,
    messageId: chrisMsg.id,
    content:
      "Yes, please call me today if you can — I've been waiting for someone to actually " +
      "explain what went wrong, not just ask for the listing. I'm free after 2pm.",
    sentiment: "positive",
    isHotLead: true,
  });
  console.log(`Created sent message + hot reply for ${chris.name}.`);

  // 5. Petra Walsh — status: hot — very quick positive reply
  const petra = byName["Petra Walsh"];
  const petraMsg = createMessage({
    tenantId: tenant.id,
    leadId: petra.id,
    channel: "email",
    draftText:
      "Hi Petra — I came across Clearview's reviews and was impressed by the turnaround " +
      "times. We close several transactions a month and consistently recommend inspectors " +
      "who can accommodate short contingency windows. Would you be open to a mutual-referral " +
      "arrangement — inspections from us, buyer referrals from you?",
  });
  approveMessage(tenant.id, petraMsg.id, petraMsg.draft_text);
  markMessageSent(tenant.id, petraMsg.id, "sim_" + petraMsg.id.slice(0, 8));
  createReply({
    tenantId: tenant.id,
    messageId: petraMsg.id,
    content:
      "Absolutely interested! We've been wanting to build a relationship with a reliable " +
      "agent for exactly this. I can do a call this week — Wednesday works best for me.",
    sentiment: "positive",
    isHotLead: true,
  });
  console.log(`Created sent message + hot reply for ${petra.name}.`);

  // ---- Agent logs — realistic pipeline run traces ---------------------------
  const logInputBase = { tenantId: tenant.id, event: "seed_script_demo_run" };

  logAgentRun({
    tenantId: tenant.id,
    agentName: "orchestrator",
    input: { leadId: chris.id, leadName: "Chris Delgado", trigger: "manual" },
    output: {
      stages: ["research", "rag", "drafting"],
      totalDurationMs: 4812,
      status: "completed",
    },
    status: "success",
  });
  logAgentRun({
    tenantId: tenant.id,
    agentName: "research",
    input: { leadId: chris.id, leadType: "expired_listing" },
    output: {
      summary: "Expired listing after 120 days. Likely pricing gap vs. current comparables.",
      signals: ["high days_on_market", "no_relist", "price_above_comps"],
      durationMs: 1821,
    },
    status: "success",
  });
  logAgentRun({
    tenantId: tenant.id,
    agentName: "rag",
    input: { query: "expired listing outreach", topK: 3 },
    output: {
      snippets: 3,
      topScore: 0.91,
      tags: ["case_study", "expired_listings", "pricing"],
      durationMs: 687,
    },
    status: "success",
  });
  logAgentRun({
    tenantId: tenant.id,
    agentName: "drafting",
    input: { leadId: chris.id, channel: "email" },
    output: {
      wordCount: 68,
      subject: "Fresh take on your Eastdale listing",
      durationMs: 2304,
    },
    status: "success",
  });
  logAgentRun({
    tenantId: tenant.id,
    agentName: "send",
    input: { messageId: chrisMsg.id, provider: "simulated" },
    output: { status: "sent", externalId: "sim_" + chrisMsg.id.slice(0, 8) },
    status: "success",
  });
  logAgentRun({
    tenantId: tenant.id,
    agentName: "tracking",
    input: { messageId: chrisMsg.id, replyContent: "Yes, please call me today…" },
    output: { sentiment: "positive", isHotLead: true, newStatus: "hot", durationMs: 1103 },
    status: "success",
  });

  // Also log Taylor's pipeline
  logAgentRun({
    tenantId: tenant.id,
    agentName: "orchestrator",
    input: { leadId: taylor.id, leadName: "Taylor Nguyen", trigger: "manual" },
    output: { stages: ["research", "rag", "drafting"], totalDurationMs: 5103, status: "completed" },
    status: "success",
  });
  logAgentRun({
    tenantId: tenant.id,
    agentName: "tracking",
    input: { messageId: taylorMsg.id, replyContent: "Hi — yes, I'd be interested…" },
    output: { sentiment: "positive", isHotLead: false, newStatus: "replied", durationMs: 988 },
    status: "success",
  });

  console.log(`Created 8 agent log entries.`);

  // ---- Summary ---------------------------------------------------------------

  console.log("\n" + "=".repeat(60));
  console.log("  SEED COMPLETE");
  console.log("=".repeat(60));
  console.log(`  Tenant:   ${tenant.name}  (id: ${tenant.id})`);
  console.log(`  Leads:    ${leads.length} (all pipeline stages represented)`);
  console.log(`  KB:       ${kbEntries.length} entries`);
  console.log(`  Messages: 5 (1 draft, 1 approved+sent, 3 sent+replied)`);
  console.log(`  Replies:  3 (2 hot leads, 1 positive)`);
  console.log("");
  console.log("  LOGIN CREDENTIALS:");
  console.log("  admin:  admin@meridianrealty.test  /  demo-password-123");
  console.log("  member: agent@meridianrealty.test  /  demo-password-123");
  console.log("=".repeat(60));
  console.log("\nNext step: embed the knowledge base into Chroma:");
  console.log("  docker-compose up -d   (if not already running)");
  console.log("  npm run ingest-kb");
  console.log("\nThen start both servers:");
  console.log("  npm start              (backend → http://localhost:4000)");
  console.log("  cd ../dashboard && node run-dev.js  (dashboard → http://localhost:3000)");
}

seed();
