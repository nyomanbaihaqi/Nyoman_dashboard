/* ──────────────────────────────────────────────────────────────
   Workspace OS — sample data

   Content lifted from the design handoff so every screen renders with
   the copy it was designed against.

   Dates are anchored to the current week rather than hardcoded to May
   2024, so "Today" and "Yesterday" labels stay truthful whenever this
   is opened. The local backend seeds from this; the Sheets backend can
   use it to populate an empty spreadsheet.
   ────────────────────────────────────────────────────────────── */

(function (WOS) {
  "use strict";

  /** Monday of the current week, at local midnight. */
  function weekStart() {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // getDay(): 0 = Sunday
    return d;
  }

  var WEEK = weekStart();

  /** ISO datetime for `dayOffset` days after Monday, at HH:mm local. */
  function at(dayOffset, hh, mm) {
    var d = new Date(WEEK);
    d.setDate(d.getDate() + dayOffset);
    d.setHours(hh || 0, mm || 0, 0, 0);
    return d.toISOString();
  }

  /** Today as an offset from Monday (Mon = 0 … Sun = 6). */
  var TODAY = (new Date().getDay() + 6) % 7;

  /**
   * Divisions are the unit the PM job actually works in: tasks are handed to a
   * division, followed up per division, and reviewed per division every week.
   * `leadId` is who gets chased when that division goes quiet.
   */
  var divisions = [
    { id: "d_commercial", name: "Commercial", leadId: "m_priya", color: "var(--rose-600)" },
    { id: "d_engineering", name: "Engineering", leadId: "m_rizky", color: "var(--sky-600)" },
    { id: "d_content", name: "Content", leadId: "m_fauzan", color: "var(--amber-600)" },
    { id: "d_ops", name: "Operations", leadId: "m_dinda", color: "var(--emerald-600)" },
  ];

  // `role` is access level (owner/editor/viewer); `divisionId` is org structure.
  // They answer different questions and are deliberately kept apart.
  var members = [
    { id: "m_alex", name: "Alex Rivera", email: "alex@workspaceos.app", title: "PA · PM · AI Engineer", initials: "A", avatarColor: "var(--antar-purple)", photoUrl: "", role: "owner", divisionId: "", timezone: "Asia/Jakarta" },
    { id: "m_rizky", name: "Rizky P.", email: "rizky@workspaceos.app", title: "Engineering Lead", initials: "R", avatarColor: "var(--sky-600)", photoUrl: "", role: "editor", divisionId: "d_engineering", timezone: "Asia/Jakarta" },
    { id: "m_fauzan", name: "Fauzan M.", email: "fauzan@workspaceos.app", title: "Content Producer", initials: "F", avatarColor: "var(--amber-600)", photoUrl: "", role: "editor", divisionId: "d_content", timezone: "Asia/Jakarta" },
    { id: "m_priya", name: "Priya S.", email: "priya@workspaceos.app", title: "Marketing Lead", initials: "P", avatarColor: "var(--rose-600)", photoUrl: "", role: "editor", divisionId: "d_commercial", timezone: "Asia/Jakarta" },
    { id: "m_dinda", name: "Dinda K.", email: "dinda@workspaceos.app", title: "Operations", initials: "D", avatarColor: "var(--emerald-600)", photoUrl: "", role: "viewer", divisionId: "d_ops", timezone: "Asia/Jakarta" },
  ];

  var projects = [
    {
      id: "p_host", name: "Host Academy", category: "Training Program",
      description: "Host Academy is the internal training program for live-selling hosts covering appearance SOPs, on-camera talking style, and product mastery. Currently in the content-production phase with checkpoint reviews every two weeks.",
      status: "on_track", progress: 75, ownerId: "m_alex",
      memberIds: ["m_alex", "m_rizky", "m_fauzan", "m_dinda"],
      dueAt: at(11), icon: "crown", iconBg: "#ecfdf5", iconColor: "#059669", createdAt: at(-30),
    },
    {
      id: "p_dashboard", name: "Dashboard Development", category: "Internal Dashboard",
      description: "Internal analytics dashboard for host performance, campaign reporting, and project health. MVP covers the reporting module and host analytics views.",
      status: "on_track", progress: 60, ownerId: "m_rizky", memberIds: ["m_rizky", "m_alex"],
      dueAt: at(24), icon: "chart-line", iconBg: "#f0f9ff", iconColor: "#0284c7", createdAt: at(-24),
    },
    {
      id: "p_ai", name: "AI Automation System", category: "Automation & AI",
      description: "Scheduled workflows that run the business in the background: daily report digests, task reminders, meeting summarisation, and escalation rules.",
      status: "at_risk", progress: 40, ownerId: "m_alex", memberIds: ["m_alex", "m_rizky"],
      dueAt: at(31), icon: "rocket", iconBg: "#f5f3ff", iconColor: "#7c3aed", createdAt: at(-18),
    },
    {
      id: "p_data", name: "Data Integration", category: "System Integration",
      description: "Connect the spreadsheet backend, calendar, and mail into one source of truth.",
      status: "on_hold", progress: 30, ownerId: "m_dinda", memberIds: ["m_dinda"],
      dueAt: at(38), icon: "boxes", iconBg: "#f8fafc", iconColor: "#64748b", createdAt: at(-15),
    },
    {
      id: "p_sop", name: "SOP & Documentation", category: "Operational",
      description: "Standard operating procedures for live streaming, host onboarding, and content review.",
      status: "on_track", progress: 80, ownerId: "m_fauzan", memberIds: ["m_fauzan", "m_alex"],
      dueAt: at(15), icon: "file-pen", iconBg: "#fff7ed", iconColor: "#ea580c", createdAt: at(-40),
    },
  ];

  /** Which division a member belongs to, for defaulting a task's owner side. */
  var DIVISION_OF = {};
  members.forEach(function (m) {
    DIVISION_OF[m.id] = m.divisionId;
  });

  /**
   * `extra` carries the fields the operating model needs beyond the basics:
   *
   *   divisionId       who owns it as a team, not just as a person
   *   ownerConfirmed   the assignee has accepted it ("owner yang terverifikasi")
   *   deadlineAgreed   the date was agreed, not imposed ("deadline yang disepakati")
   *   blocker          what is holding it up, empty when nothing is
   *   escalated        raised to the CEO deliberately, not inferred from being late
   *   sourceMeetingId  the meeting this came out of, so a task traces home
   */
  function task(id, title, description, priority, status, dueAt, assigneeId, projectId, tags, order, created, updated, extra) {
    extra = extra || {};
    return {
      id: id, title: title, description: description, priority: priority, status: status,
      dueAt: dueAt, assigneeId: assigneeId, projectId: projectId, tags: tags, order: order,
      createdAt: created, updatedAt: updated,
      divisionId: extra.divisionId !== undefined ? extra.divisionId : DIVISION_OF[assigneeId] || "",
      ownerConfirmed: !!extra.ownerConfirmed,
      deadlineAgreed: !!extra.deadlineAgreed,
      blocker: extra.blocker || "",
      escalated: !!extra.escalated,
      sourceMeetingId: extra.sourceMeetingId || null,
    };
  }

  var tasks = [
    task("t_1", "Review Host Performance Dashboard", "Walk through the reporting module and note anything that blocks launch.", "high", "in_progress", at(TODAY, 17), "m_alex", "p_dashboard", ["Dashboard"], 0, at(-3), at(-1)),
    task("t_2", "Follow up Budget Approval", "Chase Priya on the June ads budget so the campaign slot is locked before Friday.", "high", "todo", at(TODAY, 11), "m_alex", null, ["Finance"], 1, at(-2), at(-1), { divisionId: "d_commercial", ownerConfirmed: true, deadlineAgreed: true, blocker: "Menunggu breakdown final dari Priya", escalated: true }),
    task("t_3", "Prepare Training Material Host Academy", "Module 4 slides and the checkpoint 3 rubric draft.", "medium", "todo", at(TODAY, 13), "m_rizky", "p_host", ["Training"], 2, at(-2), at(-1)),
    task("t_4", "Approve Budget Ads June", "Review the $820 breakdown attached to Priya's request.", "medium", "in_review", at(TODAY, 15), "m_alex", null, ["Marketing"], 3, at(-1), at(0)),
    task("t_5", "Update SOP Live Streaming", "Refresh the lighting and audio checklist after the studio change.", "low", "todo", at(TODAY + 1, 12), "m_dinda", "p_sop", ["SOP", "Ops"], 4, at(-4), at(-2)),
    task("t_6", "Design AI Automation Flow v2", "Retry loop with exponential backoff applied to every scheduled workflow.", "high", "in_progress", at(4, 17), "m_alex", "p_ai", ["AI", "Automation"], 5, at(-5), at(0), { divisionId: "d_engineering", ownerConfirmed: true, deadlineAgreed: true, sourceMeetingId: "mt_ai" }),
    task("t_7", "Sync with Marketing on Campaign Report", "Final numbers for the May campaign.", "medium", "done", at(4, 10), "m_fauzan", null, ["Marketing"], 6, at(-6), at(-1)),
    task("t_8", "Draft Q3 Performance Report", "Pull the quarter's numbers and draft the narrative section.", "medium", "todo", at(7, 12), "m_alex", null, ["Report"], 7, at(-2), at(-2)),
    task("t_9", "Clean up Knowledge Base folders", "Archive stale SOPs and re-file loose meeting notes.", "low", "todo", at(10, 12), "m_rizky", null, ["Knowledge"], 8, at(-1), at(-1)),
    /* Host Academy board cards */
    task("t_ha41", "Draft checkpoint 3 rubric", "", "medium", "todo", at(5, 17), "m_rizky", "p_host", ["Content"], 0, at(-3), at(-1)),
    task("t_ha42", "Source mentor for advanced track", "", "low", "todo", at(8, 17), "m_fauzan", "p_host", ["Ops"], 1, at(-3), at(-1)),
    task("t_ha43", "Update brand kit slide templates", "", "low", "todo", null, "m_alex", "p_host", ["Design"], 2, at(-3), at(-1)),
    task("t_ha37", "Record module 4 walkthrough video", "", "high", "in_progress", at(3, 17), "m_alex", "p_host", ["Video"], 0, at(-6), at(0)),
    task("t_ha38", "Finish dashboard for host analytics", "", "high", "in_progress", at(4, 17), "m_rizky", "p_host", ["Dashboard"], 1, at(-6), at(0)),
    task("t_ha30", "Checkpoint 2 re-shoot footage", "Lighting was too dark in the studio.", "medium", "in_review", at(2, 17), "m_fauzan", "p_host", ["Video"], 0, at(-8), at(-1)),
    task("t_ha21", "Finalize curriculum outline v3", "", "low", "done", at(-2, 17), "m_alex", "p_host", ["Content"], 0, at(-12), at(-2)),
    task("t_ha22", "Approve mentor assignment list", "", "low", "done", at(-2, 17), "m_alex", "p_host", ["Ops"], 1, at(-12), at(-2)),
  ];

  var milestones = [
    { id: "ms_1", projectId: "p_host", name: "Curriculum Design", ownerId: "m_alex", startAt: at(0), endAt: at(13), isMilestone: false, progress: 100, status: "on_track" },
    { id: "ms_2", projectId: "p_host", name: "Content Production", ownerId: "m_rizky", startAt: at(7), endAt: at(34), isMilestone: false, progress: 65, status: "on_track" },
    { id: "ms_3", projectId: "p_host", name: "Checkpoint 2 Review", ownerId: "m_fauzan", startAt: at(21), endAt: at(27), isMilestone: true, progress: 0, status: "on_track" },
    { id: "ms_4", projectId: "p_host", name: "Mentor Onboarding", ownerId: "m_dinda", startAt: at(14), endAt: at(27), isMilestone: false, progress: 40, status: "at_risk" },
    { id: "ms_5", projectId: "p_host", name: "Platform QA", ownerId: "m_rizky", startAt: at(28), endAt: at(48), isMilestone: false, progress: 20, status: "at_risk" },
    { id: "ms_6", projectId: "p_host", name: "Host Academy Launch", ownerId: "m_alex", startAt: at(49), endAt: at(55), isMilestone: true, progress: 0, status: "on_track" },
  ];

  var events = [
    { id: "e_1", title: "Daily Sync Up", description: "Quick standup with the team.", startAt: at(3, 9), endAt: at(3, 9, 30), location: "Online", label: "meetings", attendeeIds: ["m_alex", "m_rizky", "m_fauzan"], meetingId: null },
    { id: "e_2", title: "Review Dashboard", description: "Walk through the reporting module with Rizky.", startAt: at(1, 10), endAt: at(1, 11), location: "Meeting Room", label: "deep_work", attendeeIds: ["m_alex", "m_rizky"], meetingId: null },
    { id: "e_3", title: "Meeting CEO", description: "Monthly strategy review.", startAt: at(2, 13), endAt: at(2, 14), location: "Meeting Room", label: "urgent", attendeeIds: ["m_alex", "m_dinda"], meetingId: null },
    { id: "e_4", title: "Meeting CEO", description: "Follow-up on strategy actions.", startAt: at(4, 13), endAt: at(4, 14), location: "Meeting Room", label: "urgent", attendeeIds: ["m_alex", "m_dinda"], meetingId: null },
    { id: "e_5", title: "AI Automation Review", description: "Review last sprint automation workflows, discuss failures, and plan next iteration for the Daily Report bot.", startAt: at(4, 15), endAt: at(4, 16), location: "Workspace", label: "travel", attendeeIds: ["m_alex", "m_rizky", "m_fauzan"], meetingId: "mt_ai" },
    { id: "e_6", title: "Follow Up & Email Time", description: "Deep work block.", startAt: at(4, 16, 30), endAt: at(4, 17, 30), location: "Deep Work", label: "personal", attendeeIds: ["m_alex"], meetingId: null },
    { id: "e_7", title: "Host Academy Checkpoint", description: "Checkpoint 2 review with the content team.", startAt: at(TODAY, 13), endAt: at(TODAY, 14), location: "Online", label: "meetings", attendeeIds: ["m_alex", "m_fauzan", "m_dinda"], meetingId: "mt_host" },
  ];

  var meetings = [
    {
      id: "mt_ai", title: "AI Automation Review", startAt: at(4, 15), durationMin: 60,
      participantIds: ["m_alex", "m_rizky", "m_fauzan"], projectId: "p_ai", status: "recorded",
      tags: ["AI"], ownerId: "m_alex", divisionId: "d_engineering",
      objective: "Putuskan apakah retry loop siap dirilis dan siapa yang pegang on-call.",
      decisionsNeeded: ["Rilis di sprint depan atau tunda?", "Siapa owner on-call di luar jam kerja?"],
      preReads: [{ name: "Retry Loop Prototype — spec.pdf", url: "#" }],
      sop: { room: true, materials: true, reportWa: true, photos: false, recording: true, archive: true },
      summary: "Rizky walked through the retry-loop prototype for the Daily Report workflow, which recovers automatically when the source sheet updates late. The team agreed to ship it behind a feature flag next sprint and monitor failure rates for two weeks before full rollout.",
      // The five-point MoM from the onboarding doc: a reasoning chain, read top
      // to bottom. What is true → what we are still guessing → what was put on
      // the table → what was settled → what happens next.
      fact: [
        "Daily Report workflow gagal 4,2% dari total eksekusi bulan ini.",
        "Prototype retry sudah jalan di staging sejak 2 minggu lalu.",
      ],
      assumption: [
        "Penyebab utama kegagalan adalah source sheet telat update, bukan bug di workflow.",
        "3 kali retry cukup untuk menutup mayoritas kasus.",
      ],
      proposal: [
        "Rilis di balik feature flag, pantau 2 minggu sebelum rollout penuh.",
        "Eskalasi otomatis ke on-call setelah 3 percobaan gagal.",
      ],
      decisions: [
        { time: "00:14:02", text: "Rilis retry loop di balik feature flag sprint depan." },
        { time: "00:22:47", text: "Pantau 2 minggu sebelum rollout penuh." },
        { time: "00:31:10", text: "Pola ini digeneralisasi ke workflow terjadwal lain kuartal ini." },
      ],
      openQuestions: [
        "Siapa owner on-call untuk eskalasi di luar jam kerja?",
        "Apakah delay backoff perlu bisa diatur per workflow?",
      ],
      actionItems: [
        { id: "ai_1", text: "Implement feature flag for retry loop", ownerId: "m_rizky", priority: "high", dueAt: at(4), done: false, convertedTaskId: null },
        { id: "ai_2", text: "Set up failure-rate monitoring", ownerId: "m_alex", priority: "medium", dueAt: at(7), done: false, convertedTaskId: null },
        { id: "ai_3", text: "Define on-call escalation owner", ownerId: "m_fauzan", priority: "medium", dueAt: at(9), done: false, convertedTaskId: null },
      ],
      transcript: [
        { speakerId: "m_rizky", speakerName: "Rizky P.", time: "00:02:14", text: "The prototype retries three times with exponential backoff before it pages anyone." },
        { speakerId: "m_alex", speakerName: "Alex Rivera", time: "00:08:40", text: "Let's ship it behind a flag and watch failure rates for two weeks." },
      ],
      keywords: ["Retry Loop", "Automation", "Feature Flag", "Monitoring"],
      language: "English", sentiment: "Positive", aiConfidence: 94,
    },
    {
      id: "mt_roadmap", title: "Product Roadmap Sync — Q3 Planning", startAt: at(4, 10), durationMin: 42,
      participantIds: ["m_alex", "m_rizky", "m_fauzan", "m_priya", "m_dinda"], projectId: "p_dashboard",
      status: "processed", tags: ["Roadmap"], ownerId: "m_alex", divisionId: "",
      objective: "Kunci prioritas Q3 dan bereskan tabrakan bandwidth engineering.",
      decisionsNeeded: ["Budget influencer Q3 disetujui berapa?", "Automation ditunda atau jalan paralel?"],
      preReads: [{ name: "Q3 Roadmap Draft.pdf", url: "#" }, { name: "Dashboard MVP status.xlsx", url: "#" }],
      sop: { room: true, materials: true, reportWa: true, photos: true, recording: true, archive: true },
      summary: "The team reviewed Q3 roadmap priorities, focusing on the AI Automation System and Dashboard Development workstreams. Alex opened with a recap of Q2 outcomes, noting the Host Academy launch landed on time and the dashboard MVP is at 60% completion.\n\nRizky raised concerns about engineering bandwidth given two concurrent workstreams, proposing to push the AI Automation rollout by two weeks to protect dashboard quality. The group agreed this tradeoff was acceptable given dashboard is customer-facing.\n\nBudget for the influencer campaign was approved at $3,500, contingent on Priya sharing final creator list by Friday. Action items were assigned across the team with most due within the next week.",
      fact: [
        "Host Academy rilis tepat waktu di Q2.",
        "Dashboard MVP di angka 60%.",
        "Dua workstream jalan paralel dengan tim engineering yang sama.",
      ],
      assumption: [
        "Dashboard lebih mendesak karena customer-facing.",
        "Menunda automation 2 minggu tidak menggeser komitmen ke pihak lain.",
      ],
      proposal: [
        "Tunda rollout AI Automation 2 minggu.",
        "Setujui budget influencer $3.500 dengan syarat creator list masuk Jumat.",
      ],
      decisions: [
        { time: "00:11:20", text: "Influencer campaign budget approved at $3,500." },
        { time: "00:18:05", text: "AI Automation System launch postponed by two weeks." },
        { time: "00:26:40", text: "Dashboard needs a redesign of the reporting module before launch." },
        { time: "00:33:15", text: "Waiting on legal approval before signing brand partnership terms." },
      ],
      openQuestions: [
        "Who owns QA sign-off for the automation workflows?",
        "Is the advanced Host Academy track launching this quarter or next?",
        "What's the fallback if the influencer creators fall through?",
      ],
      actionItems: [
        { id: "ai_r1", text: "Push AI Automation rollout by two weeks", ownerId: "m_rizky", priority: "high", dueAt: at(4), done: false, convertedTaskId: null },
        { id: "ai_r2", text: "Share final influencer creator list", ownerId: "m_priya", priority: "high", dueAt: at(4), done: false, convertedTaskId: null },
        { id: "ai_r3", text: "Finalize mentor for advanced track", ownerId: "m_fauzan", priority: "medium", dueAt: at(7), done: false, convertedTaskId: null },
        { id: "ai_r4", text: "Review updated brand partnership terms with legal", ownerId: "m_alex", priority: "medium", dueAt: at(9), done: false, convertedTaskId: null },
        { id: "ai_r5", text: "Circulate Q3 roadmap doc to stakeholders", ownerId: "m_alex", priority: "low", dueAt: at(11), done: false, convertedTaskId: null },
      ],
      transcript: [
        { speakerId: "m_alex", speakerName: "Alex Rivera", time: "00:02:14", text: "Let's start with a quick recap of Q2 — Host Academy launched on time and the dashboard MVP is sitting at about 60%." },
        { speakerId: "m_rizky", speakerName: "Rizky P.", time: "00:05:40", text: "Given we're running two workstreams in parallel, I'd rather push automation by two weeks than rush the dashboard." },
        { speakerId: "m_priya", speakerName: "Priya S.", time: "00:12:03", text: "On marketing's side, I can lock in the influencer budget today if we approve $3,500 for Q3." },
        { speakerId: "m_fauzan", speakerName: "Fauzan M.", time: "00:18:27", text: "I still need a mentor for the advanced track — flagging that as a blocker for now." },
      ],
      keywords: ["Q3 Roadmap", "Dashboard", "AI Automation", "Budget", "Host Academy", "Influencer Campaign"],
      language: "English", sentiment: "Positive", aiConfidence: 96,
    },
    {
      id: "mt_marketing", title: "Meeting with Marketing Team", startAt: at(4, 9), durationMin: 45,
      participantIds: ["m_alex", "m_rizky", "m_priya"], projectId: null, status: "recorded",
      tags: ["Marketing"], ownerId: "m_alex", divisionId: "d_commercial",
      objective: "Sepakati kalender kampanye Q3 dan alokasi budget per channel.",
      decisionsNeeded: [], preReads: [],
      sop: { room: true, materials: true, reportWa: true, photos: false, recording: true, archive: false },
      summary: "Discussed the Q3 campaign calendar, budget allocation across channels, and the upcoming Host Academy promo push.",
      fact: [], assumption: [], proposal: [], decisions: [], openQuestions: [], actionItems: [], transcript: [],
      keywords: ["Marketing", "Q3"], language: "English", sentiment: "Neutral", aiConfidence: 88,
    },
    {
      id: "mt_host", title: "Host Academy Checkpoint", startAt: at(TODAY, 13), durationMin: 60,
      participantIds: ["m_alex", "m_fauzan", "m_dinda"], projectId: "p_host", status: "recorded",
      tags: ["Training"], ownerId: "m_fauzan", divisionId: "d_content",
      objective: "Review checkpoint 2 dan putuskan perlu re-shoot atau tidak.",
      decisionsNeeded: ["Re-shoot checkpoint 2 atau lanjut dengan footage yang ada?"],
      preReads: [],
      sop: { room: true, materials: true, reportWa: false, photos: false, recording: true, archive: false },
      summary: "Checkpoint 2 review. Footage needs a re-shoot — lighting was too dark in the studio.",
      fact: ["Lighting studio di bawah standar pada sesi checkpoint 2."],
      assumption: [], proposal: [], decisions: [], openQuestions: [], actionItems: [], transcript: [],
      keywords: ["Host Academy", "Checkpoint"], language: "English", sentiment: "Neutral", aiConfidence: 90,
    },
    {
      id: "mt_budget", title: "Budget Review — June Ads", startAt: at(2, 11), durationMin: 30,
      participantIds: ["m_alex", "m_priya"], projectId: null, status: "recorded",
      tags: ["Finance"], ownerId: "m_priya", divisionId: "d_commercial",
      objective: "Kunci angka belanja iklan Juni sebelum tenggat approval.",
      decisionsNeeded: [], preReads: [{ name: "Budget_Breakdown_June.pdf", url: "#" }],
      sop: { room: true, materials: true, reportWa: true, photos: false, recording: false, archive: true },
      summary: "Reviewed the June ad spend breakdown ahead of the approval deadline.",
      fact: [], assumption: [], proposal: [], decisions: [], openQuestions: [], actionItems: [], transcript: [],
      keywords: ["Budget", "Ads"], language: "English", sentiment: "Neutral", aiConfidence: 85,
    },
    {
      id: "mt_standup", title: "Weekly Standup", startAt: at(0, 9), durationMin: 20,
      participantIds: ["m_alex", "m_rizky", "m_fauzan"], projectId: null, status: "no_recording",
      tags: ["Ops"], ownerId: "m_alex", divisionId: "", summary: "",
      objective: "", decisionsNeeded: [], preReads: [],
      sop: { room: false, materials: false, reportWa: false, photos: false, recording: false, archive: false },
      fact: [], assumption: [], proposal: [], decisions: [], openQuestions: [], actionItems: [], transcript: [],
      keywords: [], language: "English", sentiment: "Neutral", aiConfidence: 0,
    },
  ];

  var notes = [
    {
      id: "n_ai_ideas", title: "AI Automation Ideas", icon: "💡", kind: "note",
      content:
        "## Self-healing retry loop\n\n" +
        "The Daily Report workflow fails whenever the source sheet updates late. Instead of alerting a human immediately, we can retry on a backoff schedule and only escalate after three failed attempts.\n\n" +
        "> [!callout] This pattern could generalize to every scheduled automation, not just Daily Report.\n\n" +
        "### Next Steps\n\n" +
        "- [x] Prototype retry loop\n" +
        "- [ ] Ship behind feature flag\n" +
        "- [ ] Set up monitoring dashboard\n\n" +
        "| Workflow | Failure Rate | Priority |\n| --- | --- | --- |\n| Daily Report | 4.2% | High |\n| Weekly Digest | 1.1% | Low |\n| Task Reminder Push | 0.4% | Low |\n\n" +
        "> \"Ship it behind a flag, watch it for two weeks.\" — Rizky, on rollout strategy\n\n" +
        "---\n\n" +
        "```\nretryWithBackoff(job, { maxAttempts: 3, baseDelayMs: 2000 })\n```",
      tags: ["AI", "Automation"], projectId: "p_ai", authorId: "m_alex",
      pinned: false, archived: false, createdAt: at(-5), updatedAt: at(TODAY, 9),
    },
    {
      id: "n_marketing", title: "Meeting with Marketing Team", icon: "💬", kind: "meeting_note",
      content:
        "## Agenda\n\n" +
        "Discussed the Q3 campaign calendar, budget allocation across channels, and the upcoming Host Academy promo push.\n\n" +
        "> [!callout] Budget for June ads must be approved by Friday to hit the campaign launch date.\n\n" +
        "### Action Items\n\n" +
        "- [x] Finalize Q3 channel budget split\n" +
        "- [x] Get sign-off on Host Academy promo assets\n" +
        "- [ ] Share campaign calendar with sales\n" +
        "- [ ] Book media buy for June\n\n" +
        "### Budget Table\n\n" +
        "| Channel | Budget | Spent |\n| --- | --- | --- |\n| Paid Social | $4,200 | $3,150 |\n| Search | $2,800 | $2,600 |\n| Influencer / KOL | $3,500 | $1,900 |\n| Email | $500 | $210 |",
      tags: ["Marketing", "Q3"], projectId: null, authorId: "m_alex",
      pinned: false, archived: false, createdAt: at(4, 9), updatedAt: at(4, 10),
    },
    { id: "n_curriculum", title: "Host Academy Curriculum v3", icon: "📘", kind: "doc", content: "## Curriculum v3\n\nModules 1–4 cover appearance SOPs, on-camera talking style, product mastery, and live-selling mechanics.", tags: ["Training"], projectId: "p_host", authorId: "m_rizky", pinned: true, archived: false, createdAt: at(-10), updatedAt: at(TODAY - 1, 14) },
    { id: "n_q3report", title: "Q3 Performance Report Draft", icon: "📈", kind: "doc", content: "## Draft\n\nNumbers pending from the dashboard reporting module.", tags: ["Report"], projectId: "p_dashboard", authorId: "m_fauzan", pinned: false, archived: false, createdAt: at(-8), updatedAt: at(-4) },
    { id: "n_sop_live", title: "SOP – Live Streaming Setup", icon: "🎥", kind: "doc", content: "## Setup checklist\n\n- [ ] Key light at 45°\n- [ ] Audio gain check\n- [ ] Product staging", tags: ["SOP"], projectId: "p_sop", authorId: "m_dinda", pinned: true, archived: false, createdAt: at(-20), updatedAt: at(-7) },
    { id: "n_campaign_may", title: "Campaign Report May", icon: "📊", kind: "doc", content: "## May campaign\n\nFinal numbers are in — campaign beat target by 12%.", tags: ["Marketing"], projectId: null, authorId: "m_priya", pinned: false, archived: false, createdAt: at(-9), updatedAt: at(-5) },
    { id: "n_brand_terms", title: "Brand Partnership Terms v2", icon: "🤝", kind: "doc", content: "## Terms\n\nPending legal review.", tags: ["Legal"], projectId: null, authorId: "m_alex", pinned: true, archived: false, createdAt: at(-6), updatedAt: at(-3) },
    { id: "n_daily_1", title: "Standup thoughts", icon: "🗒️", kind: "daily", content: "Dashboard is close — mostly polishing the reporting module now.", tags: [], projectId: null, authorId: "m_alex", pinned: false, archived: false, createdAt: at(TODAY, 9, 14), updatedAt: at(TODAY, 9, 14) },
    { id: "n_daily_2", title: "Idea: retry loop", icon: "🗒️", kind: "daily", content: "Could apply exponential backoff to all scheduled workflows, not just Daily Report.", tags: [], projectId: null, authorId: "m_alex", pinned: false, archived: false, createdAt: at(TODAY, 11, 40), updatedAt: at(TODAY, 11, 40) },
    { id: "n_daily_3", title: "Host Academy checkpoint recap", icon: "🗒️", kind: "daily", content: "Checkpoint 2 needs a reshoot — lighting was too dark in the studio.", tags: [], projectId: null, authorId: "m_alex", pinned: false, archived: false, createdAt: at(TODAY - 1, 16, 5), updatedAt: at(TODAY - 1, 16, 5) },
    { id: "n_daily_4", title: "Q3 planning kickoff", icon: "🗒️", kind: "daily", content: "Set initial priorities for AI Automation and Dashboard workstreams.", tags: [], projectId: null, authorId: "m_alex", pinned: false, archived: false, createdAt: at(-7, 10), updatedAt: at(-7, 10) },
  ];

  var ideas = [
    { id: "i_1", title: "Self-healing automations", text: "Retry loops with exponential backoff across all scheduled workflows.", status: "validated", authorId: "m_alex", createdAt: at(-5) },
    { id: "i_2", title: "Host Academy certification badge", text: "Bundle certification with dashboard launch to drive adoption.", status: "draft", authorId: "m_alex", createdAt: at(-4) },
    { id: "i_3", title: "AI meeting digest email", text: "Auto-send a daily digest of meeting decisions to stakeholders.", status: "draft", authorId: "m_rizky", createdAt: at(-4) },
    { id: "i_4", title: "Voice-only quick capture", text: "Let users dictate notes hands-free from mobile.", status: "archived", authorId: "m_alex", createdAt: at(-9) },
    { id: "i_5", title: "Cross-project dependency map", text: "Visualize how Host Academy and Dashboard workstreams intersect.", status: "validated", authorId: "m_dinda", createdAt: at(-3) },
    { id: "i_6", title: "Weekly AI briefing digest", text: "Summarize the week's meetings, tasks, and decisions every Friday.", status: "draft", authorId: "m_alex", createdAt: at(-2) },
  ];

  /**
   * Decisions the CEO has to make. Most carry no number at all — "safety stock
   * cukup atau percepat lead time?" is a decision, not a purchase — so `amount`
   * is optional and `options` carries the actual choice on the table.
   *
   *   kind     "spend" when there's a number, "decision" otherwise
   *   context  the background the CEO needs to decide without a meeting
   *   options  what they're choosing between; empty means a plain yes/no
   */
  var approvals = [
    {
      id: "ap_1", title: "Budget Ads Juni", kind: "spend",
      description: "Budget iklan Juni supaya slot kampanye terkunci sebelum Jumat.",
      context: "Slot inventory di channel utama habis kalau lewat Jumat. Belanja Mei terpakai 92% dengan ROAS 3,1.",
      options: [], amount: 820, currency: "USD",
      requesterId: "m_priya", approverId: "m_alex", divisionId: "d_commercial",
      state: "pending", requestedAt: at(TODAY, 9, 12), decidedAt: null, decisionNote: "", raiseOn: at(TODAY),
    },
    {
      id: "ap_2", title: "Safety stock vs percepat lead time supplier", kind: "decision",
      description: "PO Batch 12 berisiko mundur. Perlu keputusan arah sebelum Kamis.",
      context: "Lead time supplier saat ini 21 hari. Stok aman menutup 12 hari ke depan. Mempercepat lead time menambah biaya ~8% per unit.",
      options: ["Andalkan safety stock, terima risiko kosong 9 hari", "Percepat lead time, biaya naik 8%"],
      amount: null, currency: "",
      requesterId: "m_dinda", approverId: "m_alex", divisionId: "d_ops",
      state: "pending", requestedAt: at(TODAY, 8, 5), decidedAt: null, decisionNote: "", raiseOn: at(TODAY),
    },
    {
      id: "ap_3", title: "Mentor advanced track Host Academy", kind: "decision",
      description: "Butuh nama mentor supaya jadwal advanced track bisa dikunci.",
      context: "Dua kandidat internal, keduanya sudah pegang beban lain. Opsi ketiga: tunda ke kuartal depan.",
      options: ["Tunjuk mentor internal", "Rekrut eksternal", "Tunda ke kuartal depan"],
      amount: null, currency: "",
      requesterId: "m_fauzan", approverId: "m_alex", divisionId: "d_content",
      state: "pending", requestedAt: at(TODAY - 1, 14), decidedAt: null, decisionNote: "", raiseOn: at(TODAY - 1),
    },
  ];

  /**
   * Perubahan Hari Ini — one small improvement tried per day.
   *
   * Seeded across three days on purpose: one still running, one finished with
   * a written result, and one dropped. A log where every entry succeeded is a
   * log nobody is being honest in.
   */
  var changes = [
    {
      id: "ch_1", title: "Rapat pagi dipotong jadi 15 menit",
      description: "Standup harian sering molor sampai 40 menit karena bahas detail teknis yang cuma relevan buat 2 orang.",
      date: at(TODAY), ownerId: "m_alex", divisionId: "d_ops", status: "running",
      tasks: [
        { id: "ct_1", text: "Umumkan format baru ke grup WA", done: true },
        { id: "ct_2", text: "Siapkan template 3 pertanyaan", done: true },
        { id: "ct_3", text: "Jalankan 3 hari berturut-turut", done: false },
        { id: "ct_4", text: "Tanya balik ke tiap divisi, kepotong apa nggak", done: false },
      ],
      result: "", impact: "", reportedAt: null,
      createdAt: at(TODAY, 7, 30), updatedAt: at(TODAY, 9, 5),
    },
    {
      id: "ch_2", title: "Report harian pindah dari WA ke satu sheet",
      description: "Report divisi tersebar di chat, hilang ketimbun. Coba satu sheet dengan kolom tetap.",
      date: at(TODAY - 1), ownerId: "m_alex", divisionId: "", status: "done",
      tasks: [
        { id: "ct_5", text: "Bikin sheet dengan kolom tetap", done: true },
        { id: "ct_6", text: "Minta 4 divisi isi selama sehari", done: true },
        { id: "ct_7", text: "Bandingkan kelengkapannya sama WA", done: true },
      ],
      result: "4 dari 4 divisi isi lengkap, dibanding 2 dari 4 waktu masih di WA. Waktu rekap turun dari 35 menit jadi 8 menit.",
      impact: "positive", reportedAt: at(TODAY - 1, 17),
      createdAt: at(TODAY - 1, 8), updatedAt: at(TODAY - 1, 17),
    },
    {
      id: "ch_3", title: "Approval budget lewat form, bukan chat",
      description: "Coba semua permintaan budget masuk lewat form supaya ada jejaknya.",
      date: at(TODAY - 3), ownerId: "m_priya", divisionId: "d_commercial", status: "dropped",
      tasks: [
        { id: "ct_8", text: "Bikin form dengan 5 field", done: true },
        { id: "ct_9", text: "Pakai selama 2 hari", done: true },
      ],
      result: "Ditinggal. Form nambah satu langkah tapi tetap harus dikejar di WA juga, jadi malah dobel kerja. Yang kepakai cuma kolom nominal dan alasan — dua itu dipindah ke halaman Decisions.",
      impact: "negative", reportedAt: at(TODAY - 2, 11),
      createdAt: at(TODAY - 3, 9), updatedAt: at(TODAY - 2, 11),
    },
  ];

  /**
   * The standard messages the role sends over and over. Kept as data so the
   * wording stays consistent no matter who is covering the desk that week.
   * Placeholders in [brackets] are filled in before sending.
   */
  var templates = [
    {
      id: "tpl_weekly", name: "Weekly Division Review", kind: "invite",
      subject: "[Weekly Review] [Divisi] — [Hari], [Tanggal], [Jam] WIB",
      body:
        "Assalamualaikum / selamat siang Tim,\n\nMengundang rekan-rekan untuk Weekly Division Review:\n\n" +
        "- Hari/Tanggal: [Hari, Tanggal]\n- Waktu: [Jam] WIB\n- Lokasi/Link: [Zoom link / Ruang Meeting]\n" +
        "- Peserta: [nama-nama PIC]\n- Agenda: Review progress mingguan, closure task overdue, blocker lintas fungsi\n" +
        "- Yang perlu disiapkan: Update status task per PIC (link ClickUp), data minggu ini\n\n" +
        "Mohon konfirmasi kehadiran. Terima kasih.\n[Nama] — Executive PM, Antarestar",
    },
    {
      id: "tpl_urgent", name: "Cross Functional Urgent", kind: "invite",
      subject: "[URGENT] Koordinasi [Divisi A] x [Divisi B] — [Topik]",
      body:
        "Halo [nama-nama],\n\nAda isu yang butuh keputusan cepat terkait [ringkas masalah].\n\nMengundang sync singkat:\n\n" +
        "- Waktu: Hari ini, [Jam] WIB, durasi 30 menit\n- Link: [Zoom/Meet]\n- Konteks: [1–2 kalimat masalah]\n" +
        "- Keputusan yang dicari: [pertanyaan keputusan]\n- Data pendukung: [link dashboard/sheet]\n\n" +
        "Kalau ada halangan mohon infokan PIC pengganti. Terima kasih.",
    },
    {
      id: "tpl_external", name: "External / Partner Meeting", kind: "invite",
      subject: "Meeting Antarestar x [Nama Partner] — [Hari], [Tanggal], [Jam] WIB",
      body:
        "Yth. Bapak/Ibu [Nama],\n\nTerima kasih atas waktunya. Berikut detail pertemuan kita:\n\n" +
        "- Hari/Tanggal: [Hari, Tanggal]\n- Waktu: [Jam] WIB (durasi ±60 menit)\n- Lokasi/Link: [alamat kantor / Zoom link]\n" +
        "- Agenda: [3 poin utama pembahasan]\n- Peserta dari Antarestar: Faiz Daffa (CEO), [nama lain]\n" +
        "- Materi/pre-read: [lampiran, jika ada]\n\n" +
        "Mohon konfirmasi kehadirannya. Jika ada perubahan jadwal, silakan hubungi saya di [kontak].\n\n" +
        "Hormat kami,\n[Nama] — Executive PM, Antarestar",
    },
    {
      id: "tpl_mbr", name: "Monthly Business Review", kind: "invite",
      subject: "[Monthly Business Review] [Bulan] — [Hari], [Tanggal], [Jam] WIB",
      body:
        "Bismillah, Assalamualaikum Wr. Wb.\n\nMengundang Bapak/Ibu untuk Monthly Business Review bulan [Bulan]:\n\n" +
        "- Hari/Tanggal: [Hari, Tanggal]\n- Waktu: [Jam] WIB\n- Lokasi: [Ruang Meeting Utama]\n" +
        "- Agenda: Progress strategic initiatives, kesehatan ritme meeting & closure, bottleneck sistem, prioritas bulan berikutnya\n" +
        "- Pre-read: [link dashboard/report — dikirim H-1]\n\n" +
        "Mohon kesediaan hadir tepat waktu. Terima kasih.",
    },
    {
      id: "tpl_mom", name: "Meeting Notes (MoM)", kind: "mom",
      subject: "[MoM] [Topik] — [Tanggal]",
      body:
        "MEETING NOTES\nTopik: [topik]\nTanggal/Waktu: [tanggal, jam]\nPeserta: [nama-nama]\nTujuan: [objektif]\n\n" +
        "FACT:\n- \n\nASSUMPTION:\n- \n\nPROPOSAL:\n- \n\nDECISION:\n- \n\nACTION ITEMS:\n- [ ] [tugas] — [PIC] — [deadline]",
    },
  ];



  var folders = [
    { id: "f_meetings", name: "Meeting Notes", icon: "message-square", iconBg: "#f0f9ff", iconColor: "#0284c7" },
    { id: "f_projects", name: "Projects Docs", icon: "briefcase", iconBg: "#f5f3ff", iconColor: "#7c3aed" },
    { id: "f_sops", name: "SOPs", icon: "file-pen", iconBg: "#fff7ed", iconColor: "#ea580c" },
    { id: "f_templates", name: "Templates", icon: "layers", iconBg: "#ecfdf5", iconColor: "#059669" },
  ];

  var files = [
    { id: "kf_1", folderId: "f_meetings", title: "Meeting with Marketing Team", noteId: "n_marketing", icon: "message-square", favorite: false, updatedAt: at(TODAY, 9), updatedById: "m_alex" },
    { id: "kf_2", folderId: "f_projects", title: "Host Academy Curriculum v3", noteId: "n_curriculum", icon: "file-pen", favorite: true, updatedAt: at(TODAY - 1, 14), updatedById: "m_rizky" },
    { id: "kf_3", folderId: "f_projects", title: "AI Automation Ideas", noteId: "n_ai_ideas", icon: "lightbulb", favorite: true, updatedAt: at(TODAY, 9), updatedById: "m_alex" },
    { id: "kf_4", folderId: "f_projects", title: "Q3 Performance Report Draft", noteId: "n_q3report", icon: "chart-line", favorite: false, updatedAt: at(-4), updatedById: "m_fauzan" },
    { id: "kf_5", folderId: "f_sops", title: "SOP – Live Streaming Setup", noteId: "n_sop_live", icon: "file-pen", favorite: false, updatedAt: at(-7), updatedById: "m_dinda" },
    { id: "kf_6", folderId: "f_meetings", title: "Brand Partnership Notes", noteId: "n_brand_terms", icon: "message-square", favorite: false, updatedAt: at(-3), updatedById: "m_alex" },
  ];

  var comments = [
    { id: "c_1", targetType: "note", targetId: "n_marketing", authorId: "m_priya", text: "can we push the influencer budget up 10%?", createdAt: at(TODAY, 8) },
    { id: "c_2", targetType: "note", targetId: "n_marketing", authorId: "m_alex", text: "approved — updating the sheet now.", createdAt: at(TODAY, 9) },
    { id: "c_3", targetType: "project", targetId: "p_host", authorId: "m_rizky", text: "just uploaded the updated curriculum deck.", createdAt: at(TODAY, 8) },
    { id: "c_4", targetType: "project", targetId: "p_host", authorId: "m_fauzan", text: "flagged that checkpoint 2 needs a re-shoot.", createdAt: at(TODAY - 1, 16) },
    { id: "c_5", targetType: "project", targetId: "p_host", authorId: "m_alex", text: "approved the mentor assignment list.", createdAt: at(TODAY - 2, 11) },
  ];

  /** Fresh copy each call, so callers can't mutate the seed by accident. */
  WOS.seed = function () {
    return WOS.clone({
      members: members,
      divisions: divisions,
      tasks: tasks,
      projects: projects,
      milestones: milestones,
      events: events,
      notes: notes,
      meetings: meetings,
      ideas: ideas,
      approvals: approvals,
      changes: changes,
      folders: folders,
      files: files,
      comments: comments,
      templates: templates,
    });
  };
})(window.WOS);
