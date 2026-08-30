import type {
  CategorySummary,
  ContentCardModel,
  CreatorSummary,
  TagSummary,
} from "@/types/content";

/**
 * Demo catalogue.
 *
 * Shapes match the view models the services return, so every browse surface
 * renders identically whether it is fed by Postgres or by this file. Only
 * `discovery-service` imports it, and only when the real catalogue is empty.
 *
 * The records are deliberately varied — different subjects, contributors,
 * topics, durations, view counts and publication dates — so filters and sort
 * orders produce genuinely different result sets rather than reshuffling the
 * same rows.
 */

const thumb = (n: number) => `/media/thumbnails/${String(n).padStart(2, "0")}.png`;
/**
 * Three short generated clips stand in for real media. Every fourth record is
 * deliberately left without a source so the player's "unavailable" state is
 * reachable in a fresh checkout rather than only in theory.
 */
const sample = (n: number) => (n % 4 === 3 ? null : `/media/samples/sample-0${(n % 3) + 1}.mp4`);
const avatar = (n: number) => `/media/avatars/${String(n).padStart(2, "0")}.png`;
/** Fractional days are allowed so the "past 24 hours" window is never empty. */
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);

// ---------------------------------------------------------------- categories

export const mockCategories: CategorySummary[] = [
  {
    id: "cat-technology",
    slug: "technology",
    name: "Technology",
    accentHex: null,
    contentCount: 0,
  },
  { id: "cat-education", slug: "education", name: "Education", accentHex: null, contentCount: 0 },
  { id: "cat-gaming", slug: "gaming", name: "Gaming", accentHex: null, contentCount: 0 },
  {
    id: "cat-documentary",
    slug: "documentary",
    name: "Documentary",
    accentHex: null,
    contentCount: 0,
  },
  { id: "cat-science", slug: "science", name: "Science", accentHex: null, contentCount: 0 },
  { id: "cat-travel", slug: "travel", name: "Travel", accentHex: null, contentCount: 0 },
  { id: "cat-creative", slug: "creative", name: "Creative", accentHex: null, contentCount: 0 },
  {
    id: "cat-entertainment",
    slug: "entertainment",
    name: "Entertainment",
    accentHex: null,
    contentCount: 0,
  },
];

export const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  technology: "Hardware teardowns, software talks and engineering practice.",
  education: "Lectures, course recordings and explanatory sessions.",
  gaming: "Design breakdowns, development logs and playthrough commentary.",
  documentary: "Long-form documentary work and field reporting.",
  science: "Research talks, lab walkthroughs and field studies.",
  travel: "Route journals, expedition notes and studies of place.",
  creative: "Craft sessions, studio process and restoration work.",
  entertainment: "Performances, interviews and live recordings.",
};

// ---------------------------------------------------------------- tags

const TAG_NAMES: Array<[string, string]> = [
  ["lecture", "Lecture"],
  ["interview", "Interview"],
  ["panel", "Panel"],
  ["field-recording", "Field recording"],
  ["conference", "Conference"],
  ["walkthrough", "Walkthrough"],
  ["restoration", "Restoration"],
  ["beginner-friendly", "Beginner friendly"],
  ["artificial-intelligence", "Artificial intelligence"],
  ["archival", "Archival"],
  ["hands-on", "Hands on"],
  ["long-form", "Long form"],
  ["case-study", "Case study"],
  ["live-recording", "Live recording"],
];

export const mockTags: TagSummary[] = TAG_NAMES.map(([slug, name]) => ({
  id: `tag-${slug}`,
  slug: slug!,
  name: name!,
  contentCount: 0,
}));

// ---------------------------------------------------------------- creators

const CREATOR_SEEDS: Array<{ slug: string; name: string; verified: boolean; avatar: number }> = [
  { slug: "northline-studio", name: "Northline Studio", verified: true, avatar: 1 },
  { slug: "meridian-lecture-series", name: "Meridian Lecture Series", verified: true, avatar: 2 },
  { slug: "field-notes-collective", name: "Field Notes Collective", verified: false, avatar: 3 },
  { slug: "atlas-workshop", name: "Atlas Workshop", verified: true, avatar: 4 },
  { slug: "harbour-institute", name: "Harbour Institute", verified: true, avatar: 5 },
  { slug: "signal-and-frame", name: "Signal & Frame", verified: false, avatar: 6 },
  { slug: "openbench-labs", name: "Openbench Labs", verified: true, avatar: 7 },
  { slug: "coastway-archive", name: "Coastway Archive", verified: false, avatar: 8 },
];

export const mockCreators: CreatorSummary[] = CREATOR_SEEDS.map((seed) => ({
  id: `cre-${seed.slug}`,
  slug: seed.slug,
  name: seed.name,
  avatarUrl: avatar(seed.avatar),
  isVerified: seed.verified,
  contentCount: 0,
}));

export const CREATOR_BIOS: Record<string, string> = {
  "northline-studio": "A small production studio publishing its process work in full.",
  "meridian-lecture-series": "A public lecture programme, recorded continuously since 1998.",
  "field-notes-collective": "Field recordists documenting working landscapes.",
  "atlas-workshop": "Repair, teardown and redesign sessions filmed end to end.",
  "harbour-institute": "An independent research institute publishing its seminar series.",
  "signal-and-frame": "Independent producers working in sound and moving image.",
  "openbench-labs": "An open hardware lab that records every design review it holds.",
  "coastway-archive": "A regional archive digitising and republishing its holdings.",
};

// ---------------------------------------------------------------- content

/** A demo row: a card model plus the tag slugs the filter engine matches on. */
export type MockContent = ContentCardModel & {
  tagSlugs: string[];
  mediaUrl: string | null;
  description: string;
};

type Seed = [
  slug: string,
  title: string,
  summary: string,
  creator: string,
  category: string,
  durationSeconds: number,
  views: number,
  daysOld: number,
  tags: string,
  featured?: 1,
];

// prettier-ignore
const SEEDS: Seed[] = [
  ["reading-a-river-sediment-as-record", "Reading a river: sediment as a historical record", "How a single riverbank core reconstructs two centuries of land use upstream.", "harbour-institute", "science", 3245, 48_200, 0.3, "lecture,case-study", 1],
  ["repairing-a-1960s-tape-machine", "Repairing a 1960s tape machine, start to finish", "A full restoration filmed in one sitting, including the two mistakes we left in.", "atlas-workshop", "creative", 5410, 132_800, 5, "restoration,hands-on,long-form", 1],
  ["introduction-to-acoustic-measurement", "A working introduction to acoustic measurement", "What the numbers on a sound level meter describe, and where they mislead.", "meridian-lecture-series", "education", 2760, 27_400, 7, "lecture,beginner-friendly", 1],
  ["designing-for-repair-a-teardown", "Designing for repair: a teardown and a redesign", "Two engineers take apart a consumer appliance and rebuild it to last.", "atlas-workshop", "technology", 4130, 91_600, 9, "walkthrough,hands-on", 1],
  ["the-quiet-hours-overnight-recording", "The quiet hours: overnight field recording practice", "Eleven nights in a working forest, and what it takes to capture them cleanly.", "field-notes-collective", "documentary", 3890, 63_900, 12, "field-recording,long-form"],
  ["why-old-maps-disagree", "Why old maps disagree with each other", "Survey error, political intent and honest uncertainty across four disputed coastlines.", "harbour-institute", "education", 2410, 208_300, 14, "lecture,archival", 1],
  ["what-a-city-budget-decides", "What a city budget actually decides", "A line-by-line walkthrough of a mid-sized municipal budget and who it affects.", "meridian-lecture-series", "education", 3620, 41_050, 17, "lecture,case-study"],
  ["building-a-level-in-public", "Building a game level in public, one week at a time", "Blockout to final art, with every review session left in.", "northline-studio", "gaming", 6120, 176_400, 19, "walkthrough,long-form"],
  ["coastal-erosion-eleven-winters", "Coastal erosion, measured over eleven winters", "A volunteer survey and what it found the models had missed.", "field-notes-collective", "science", 2985, 35_700, 23, "field-recording,case-study"],
  ["the-long-way-north", "The long way north: overland notes from four seasons", "Route planning, breakdowns and the paperwork nobody mentions.", "signal-and-frame", "travel", 4560, 88_150, 26, "long-form"],
  ["cataloguing-an-archive-nobody-indexed", "Cataloguing an archive nobody indexed", "Forty thousand unlabelled reels, three archivists, and a workable method.", "harbour-institute", "documentary", 3310, 52_600, 31, "archival,case-study", 1],
  ["observatory-notebooks", "How a small observatory keeps a century of notebooks usable", "Paper, humidity, handwriting, and the transcription project that saved them.", "meridian-lecture-series", "science", 2190, 29_800, 35, "lecture,archival"],
  ["live-score-for-a-silent-film", "Composing and performing a live score for a silent film", "Rehearsal footage and the full performance, recorded in a single take.", "signal-and-frame", "entertainment", 5240, 114_900, 40, "live-recording,long-form"],
  ["colour-grading-on-a-budget", "Colour grading on a budget: a practical session", "One scene graded four ways, with the reasoning spoken aloud throughout.", "northline-studio", "creative", 3050, 67_300, 45, "walkthrough,hands-on,beginner-friendly"],
  ["what-model-evaluation-misses", "What model evaluation misses", "A panel on benchmark design, and the failures benchmarks are blind to.", "openbench-labs", "technology", 4720, 243_100, 4, "panel,artificial-intelligence,conference"],
  ["a-short-history-of-the-spreadsheet", "A short history of the spreadsheet", "How one interface reshaped forty years of office work.", "meridian-lecture-series", "technology", 1980, 156_700, 21, "lecture,archival"],
  ["soldering-for-the-first-time", "Soldering for people who have never soldered", "Twenty-five minutes, one joint at a time, no prior experience assumed.", "openbench-labs", "education", 1520, 312_400, 60, "beginner-friendly,hands-on,walkthrough"],
  ["inside-a-tabletop-playtest", "Inside a tabletop playtest", "Four designers break their own game and rebuild the rules on camera.", "northline-studio", "gaming", 7380, 74_200, 68, "long-form,case-study"],
  ["the-last-working-lighthouse", "The last working lighthouse on the strait", "Two keepers, one winter, and the automation timetable.", "coastway-archive", "documentary", 4890, 129_600, 75, "field-recording,long-form,archival"],
  ["reading-weather-without-instruments", "Reading weather without instruments", "A practical field session on cloud, wind and pressure by observation alone.", "field-notes-collective", "travel", 2640, 58_400, 88, "field-recording,beginner-friendly"],
  ["restoring-a-water-damaged-negative", "Restoring a water-damaged negative", "A frame-by-frame conservation session, from intake to final scan.", "coastway-archive", "creative", 3720, 44_900, 96, "restoration,hands-on,archival"],
  ["why-scientific-software-rots", "Why scientific software rots", "A conference talk on reproducibility, funding cycles and unmaintained code.", "openbench-labs", "science", 2280, 187_500, 110, "conference,lecture,case-study"],
  ["an-oral-history-of-the-shipyard", "An oral history of the shipyard", "Nine interviews recorded across two years, edited into one account.", "coastway-archive", "documentary", 6540, 96_300, 125, "interview,archival,long-form"],
  ["procedural-generation-explained-slowly", "Procedural generation, explained slowly", "From noise functions to playable terrain, without skipping the arithmetic.", "northline-studio", "gaming", 3960, 221_800, 140, "beginner-friendly,walkthrough,artificial-intelligence"],
  ["the-economics-of-a-small-press", "The economics of a small press", "An hour with a publisher who opened their books to the audience.", "meridian-lecture-series", "education", 3480, 33_700, 165, "interview,case-study"],
  ["night-train-notes", "Night train notes: six countries, one timetable", "A travel journal assembled from platform recordings and carriage interviews.", "signal-and-frame", "travel", 4210, 71_500, 190, "field-recording,interview"],
  ["what-happens-in-a-design-review", "What happens in a design review", "An unedited hardware review session, with the disagreements intact.", "openbench-labs", "technology", 5680, 84_100, 215, "panel,long-form,case-study"],
  ["building-an-instrument-from-scrap", "Building an instrument from scrap", "Four weeks of workshop footage cut down to one working build.", "atlas-workshop", "creative", 4450, 108_200, 240, "hands-on,restoration,long-form"],
  ["a-conversation-about-preservation-funding", "A conversation about preservation funding", "Three archivists on what gets saved, what does not, and why.", "harbour-institute", "documentary", 2910, 26_800, 275, "panel,interview"],
  ["improvised-set-recorded-live", "An improvised set, recorded live in one room", "No overdubs, no edits, four musicians and a single pair of microphones.", "signal-and-frame", "entertainment", 3140, 143_600, 310, "live-recording"],
  ["teaching-statistics-with-real-data", "Teaching statistics with real data", "A course session built entirely on a messy public dataset.", "meridian-lecture-series", "education", 4080, 62_900, 365, "lecture,hands-on,beginner-friendly"],
  ["fifteen-minutes-on-the-spectrometer", "Fifteen minutes on how a spectrometer works", "A short bench explainer, filmed with the instrument open.", "openbench-labs", "science", 900, 96_400, 11, "beginner-friendly,hands-on"],
  ["a-full-day-at-the-seismic-station", "A full day at the seismic station", "Unedited: one shift, one instrument room, one operator narrating throughout.", "harbour-institute", "science", 21_600, 118_700, 54, "field-recording,long-form"],
  ["what-a-compiler-does-in-twelve-minutes", "What a compiler does, in twelve minutes", "Source to machine code, one stage at a time, no jargon assumed.", "openbench-labs", "technology", 735, 264_900, 33, "beginner-friendly,lecture"],
  ["one-level-one-hour-one-mistake", "A ten-minute postmortem on a shipped level", "What broke after launch, and the fix that should have come first.", "northline-studio", "gaming", 615, 82_300, 78, "case-study,walkthrough"],
  ["the-machine-that-sorted-the-post", "The machine that sorted the post", "Archival footage and new interviews on an obsolete piece of infrastructure.", "coastway-archive", "entertainment", 2550, 39_400, 430, "archival,interview"],
];

const categoryBySlug = new Map(mockCategories.map((category) => [category.slug, category]));
const creatorBySlug = new Map(mockCreators.map((creator) => [creator.slug, creator]));
const tagBySlug = new Map(mockTags.map((tag) => [tag.slug, tag]));

export const mockContent: MockContent[] = SEEDS.map((seed, index) => {
  const [slug, title, summary, creator, category, duration, views, days, tags, featured] = seed;
  return {
    id: `con-${slug}`,
    slug,
    title,
    summary,
    kind: "VIDEO" as const,
    durationSeconds: duration,
    thumbnailUrl: thumb((index % 32) + 1),
    previewUrl: sample(index),
    viewCount: views,
    favoriteCount: Math.round(views / 40),
    // Deterministic from the index so the demo catalogue renders identically
    // on the server and the client — a random ratio would hydrate mismatched.
    likeCount: Math.round((views / 10) * (0.82 + ((index % 9) * 0.02))),
    dislikeCount: Math.round((views / 10) * (0.04 + ((index % 5) * 0.01))),
    publishedAt: daysAgo(days),
    isFeatured: featured === 1,
    creator: creatorBySlug.get(creator) ?? null,
    category: categoryBySlug.get(category) ?? null,
    tagSlugs: tags.split(","),
    mediaUrl: sample(index),
    description: [
      summary,
      "",
      "This is placeholder catalogue text for a demo record. In a populated archive it would carry the full abstract, a speaker or participant list, recording conditions, and any rights or reuse information that applies.",
      "",
      "Replace it from the content admin once the real metadata is available.",
    ].join("\n"),
  };
});

// Counters are derived rather than hand-written so they can never drift out of
// step with the rows above — the same invariant the database maintains.
for (const item of mockContent) {
  const category = item.category ? categoryBySlug.get(item.category.slug) : undefined;
  if (category) category.contentCount += 1;

  const creator = item.creator ? creatorBySlug.get(item.creator.slug) : undefined;
  if (creator) creator.contentCount += 1;

  for (const slug of item.tagSlugs) {
    const tag = tagBySlug.get(slug);
    if (tag) tag.contentCount += 1;
  }
}

/** Topics actually used by at least one recording, most-used first. */
export const mockTagsInUse = mockTags
  .filter((tag) => tag.contentCount > 0)
  .sort((a, b) => b.contentCount - a.contentCount);
