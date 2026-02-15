const pptxgen = require('pptxgenjs');

const pptx = new pptxgen();
pptx.layout = 'LAYOUT_WIDE';
pptx.author = 'LineScout';
pptx.company = 'Sure Importers Limited';
pptx.subject = 'White Label Webinar';
pptx.title = 'White Label Webinar';

const SLIDE_W = 13.333;
const SLIDE_H = 7.5;
const M = 0.6;

const COLORS = {
  charcoal: '0B0B0E',
  slate: 'F5F6FA',
  white: 'FFFFFF',
  blue: '2D3461',
  blueDark: '1F2548',
  blueLight: 'E6E9F3',
  gray: '667085',
  grayLight: '98A2B3',
  border: 'E4E7EC',
};

const FONT = {
  head: 'Aptos Display',
  body: 'Aptos',
};

const LOGO_PATH = 'public/linescout-logo.png';
const PRESENTER_PHOTO = 'tochukwu_photo.JPG';
const LINE_SCOUT_SCREEN = 'linescout_screenshot.png';

function addLogo(slide) {
  // Keep logo aspect ratio inside a fixed box (no squeezing)
  slide.addImage({
    path: LOGO_PATH,
    x: SLIDE_W - 2.1,
    y: 0.35,
    w: 1.6,
    h: 0.45,
    sizing: { type: 'contain', x: SLIDE_W - 2.1, y: 0.35, w: 1.6, h: 0.45 },
  });
}

function addTitle(slide, text, opts = {}) {
  slide.addText(text, {
    x: opts.x ?? M,
    y: opts.y ?? 0.9,
    w: opts.w ?? (SLIDE_W - 2 * M),
    h: opts.h ?? 1.0,
    fontFace: FONT.head,
    fontSize: opts.size ?? 40,
    bold: true,
    color: opts.color ?? COLORS.charcoal,
  });
}

function addSubtitle(slide, text, opts = {}) {
  slide.addText(text, {
    x: opts.x ?? M,
    y: opts.y ?? 1.95,
    w: opts.w ?? (SLIDE_W - 2 * M),
    h: opts.h ?? 0.6,
    fontFace: FONT.body,
    fontSize: opts.size ?? 18,
    color: opts.color ?? COLORS.gray,
  });
}

function addFooter(slide, text, opts = {}) {
  slide.addText(text, {
    x: opts.x ?? M,
    y: opts.y ?? (SLIDE_H - 0.45),
    w: opts.w ?? (SLIDE_W - 2 * M),
    h: opts.h ?? 0.35,
    fontFace: FONT.body,
    fontSize: opts.size ?? 12,
    color: opts.color ?? COLORS.grayLight,
  });
}

function addCard(slide, { x, y, w, h, title, body, icon, accent }) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x,
    y,
    w,
    h,
    rx: 0.12,
    ry: 0.12,
    fill: { color: COLORS.white },
    line: { color: COLORS.border, width: 1 },
    shadow: { type: 'outer', color: '000000', opacity: 0.08, blur: 8, offset: 2, angle: 90 },
  });
  slide.addText(icon || '', {
    x: x + 0.2,
    y: y + 0.18,
    w: 0.5,
    h: 0.4,
    fontFace: FONT.body,
    fontSize: 16,
    color: accent || COLORS.blue,
    bold: true,
  });
  slide.addText(title, {
    x: x + 0.2,
    y: y + 0.6,
    w: w - 0.4,
    h: 0.45,
    fontFace: FONT.body,
    fontSize: 16,
    bold: true,
    color: COLORS.charcoal,
  });
  slide.addText(body, {
    x: x + 0.2,
    y: y + 1.05,
    w: w - 0.4,
    h: h - 1.2,
    fontFace: FONT.body,
    fontSize: 12,
    color: COLORS.gray,
  });
}

// Slide 1 — Title
{
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.charcoal };
  slide.addShape(pptx.ShapeType.rect, {
    x: 8.2,
    y: 0,
    w: 5.13,
    h: SLIDE_H,
    fill: { color: '11131A' },
    line: { color: '11131A' },
  });

  // Presenter photo on right
  slide.addImage({
    path: PRESENTER_PHOTO,
    x: 8.55,
    y: 0.8,
    w: 4.4,
    h: 5.9,
    sizing: { type: 'cover', x: 8.55, y: 0.8, w: 4.4, h: 5.9 },
  });

  addTitle(slide, 'Start Your Own Brand With\nWhite-Label Products From China', {
    x: M,
    y: 1.0,
    w: 7.2,
    color: COLORS.white,
    size: 38,
  });
  slide.addText('Tochukwu Nkwocha', {
    x: M,
    y: 3.2,
    w: 7.0,
    h: 0.4,
    fontFace: FONT.body,
    fontSize: 16,
    color: COLORS.white,
  });
  slide.addText('Founder, Sure Imports Limited', {
    x: M,
    y: 3.6,
    w: 7.0,
    h: 0.4,
    fontFace: FONT.body,
    fontSize: 14,
    color: COLORS.grayLight,
  });
  slide.addText('Since 2018', {
    x: M,
    y: 3.95,
    w: 7.0,
    h: 0.4,
    fontFace: FONT.body,
    fontSize: 14,
    color: COLORS.grayLight,
  });
  addFooter(slide, 'Nigeria-focused sourcing, branding and product guidance', {
    x: M,
    y: SLIDE_H - 0.6,
    color: COLORS.grayLight,
  });
}

// Slide 2 — Why Most People Lose Money
{
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.slate };
  addLogo(slide);
  addTitle(slide, 'Why Most People Lose Money', { size: 34 });
  addSubtitle(slide, 'Most losses happen before the first order is placed.', { y: 1.6 });

  const items = [
    { icon: '⚠', text: 'Wrong product choice' },
    { icon: '🧮', text: 'Misunderstanding real costs' },
    { icon: '🏭', text: 'Weak supplier verification' },
    { icon: '✅', text: 'No quality control plan' },
    { icon: '🏷', text: 'Branding treated as an afterthought' },
  ];

  const startX = 7.2;
  let y = 2.05;
  items.forEach((it) => {
    slide.addShape(pptx.ShapeType.roundRect, {
      x: startX,
      y,
      w: 5.2,
      h: 0.6,
      rx: 0.08,
      ry: 0.08,
      fill: { color: 'FFFFFF' },
      line: { color: COLORS.border, width: 1 },
    });
    slide.addText(it.icon, { x: startX + 0.2, y: y + 0.12, w: 0.3, h: 0.3, fontSize: 14 });
    slide.addText(it.text, {
      x: startX + 0.6,
      y: y + 0.12,
      w: 4.2,
      h: 0.4,
      fontFace: FONT.body,
      fontSize: 14,
      color: COLORS.charcoal,
    });
    y += 0.75;
  });

  addFooter(slide, 'The goal today: clarity before spending money.');
}

// Slide 3 — Who This Webinar Is For
{
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.slate };
  addLogo(slide);
  addTitle(slide, 'Who This Webinar Is For', { size: 34 });

  const cards = [
    { title: 'Starting your first brand', body: 'No prior importing experience required.', icon: '🚀' },
    { title: 'Already selling', body: 'Want better margins and reliable supply.', icon: '📈' },
    { title: 'Reliable sourcing path', body: 'Tired of guessing what to import.', icon: '🧭' },
  ];

  let x = 0.9;
  cards.forEach((c) => {
    addCard(slide, { x, y: 2.2, w: 3.9, h: 2.5, title: c.title, body: c.body, icon: c.icon });
    x += 4.2;
  });

  addFooter(slide, 'You don’t need prior importing experience.');
}

// Slide 4 — The White-Label Roadmap
{
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.slate };
  addLogo(slide);
  addTitle(slide, 'The White-Label Roadmap', { size: 34 });
  addSubtitle(slide, 'The process that successful brands follow', { y: 1.6 });

  const steps = ['Choose', 'Validate', 'Cost', 'Source', 'Brand', 'Quality', 'Launch'];
  const icons = ['🎯', '🔍', '💰', '🏭', '🎨', '✅', '🚀'];
  let x = 0.7;
  const y = 3.1;
  steps.forEach((s, i) => {
    slide.addShape(pptx.ShapeType.roundRect, {
      x,
      y,
      w: 1.55,
      h: 0.85,
      rx: 0.08,
      ry: 0.08,
      fill: { color: COLORS.white },
      line: { color: COLORS.border, width: 1 },
    });
    slide.addText(icons[i], { x: x + 0.15, y: y + 0.14, w: 0.3, h: 0.3, fontSize: 12 });
    slide.addText(s, {
      x: x + 0.45,
      y: y + 0.18,
      w: 1.0,
      h: 0.4,
      fontFace: FONT.body,
      fontSize: 12,
      color: COLORS.charcoal,
    });

    if (i < steps.length - 1) {
      slide.addShape(pptx.ShapeType.line, {
        x: x + 1.55,
        y: y + 0.42,
        w: 0.3,
        h: 0,
        line: { color: COLORS.grayLight, width: 1 },
      });
    }
    x += 1.85;
  });
}

// Slide 5 — Step 1: Choosing the Right Product
{
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.slate };
  addLogo(slide);
  addTitle(slide, 'Step 1: Choosing the Right Product', { size: 32 });
  addSubtitle(slide, 'Good white-label products usually have these traits', { y: 1.6 });

  const items = [
    'Solve everyday problems',
    'Small and efficient to ship',
    'Low breakage risk',
    'Easy to brand and package',
    'Repeat purchase potential',
  ];

  slide.addShape(pptx.ShapeType.roundRect, {
    x: 6.8,
    y: 2.1,
    w: 5.3,
    h: 3.2,
    rx: 0.12,
    ry: 0.12,
    fill: { color: COLORS.white },
    line: { color: COLORS.border, width: 1 },
  });

  let y = 2.3;
  items.forEach((t) => {
    slide.addText(`✓ ${t}`, {
      x: 7.1,
      y,
      w: 4.7,
      h: 0.35,
      fontFace: FONT.body,
      fontSize: 14,
      color: COLORS.charcoal,
    });
    y += 0.52;
  });

  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.9,
    y: 5.6,
    w: 11.3,
    h: 0.65,
    rx: 0.08,
    ry: 0.08,
    fill: { color: COLORS.blueLight },
    line: { color: COLORS.blue, width: 1 },
  });
  slide.addText('Boring products often build stronger brands.', {
    x: 1.2,
    y: 5.72,
    w: 10.7,
    h: 0.4,
    fontFace: FONT.body,
    fontSize: 15,
    color: COLORS.blue,
    bold: true,
  });
}

// Slide 6 — Step 2: Validate Demand
{
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.slate };
  addLogo(slide);
  addTitle(slide, 'Step 2: Validate Demand First', { size: 32 });
  addSubtitle(slide, 'Before importing, check:', { y: 1.6 });

  const cols = [
    { title: 'Market check', body: 'Existing sellers and price range', icon: '📊' },
    { title: 'Buyer signals', body: 'Reviews and complaints', icon: '💬' },
    { title: 'Small testing', body: 'Test ads or WhatsApp interest', icon: '🧪' },
  ];

  let x = 0.9;
  cols.forEach((c) => {
    addCard(slide, { x, y: 2.3, w: 3.9, h: 2.6, title: c.title, body: c.body, icon: c.icon });
    x += 4.2;
  });

  addFooter(slide, 'Validation costs less than wrong inventory.');
}

// Slide 7 — Step 3: Understand Your Real Costs
{
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.slate };
  addLogo(slide);
  addTitle(slide, 'Step 3: Understand Your Real Costs', { size: 32 });
  addSubtitle(slide, 'Your real cost = more than factory price', { y: 1.6 });

  const layers = [
    { label: 'Factory', color: 'CBD5E1' },
    { label: 'Shipping', color: 'A5B4FC' },
    { label: 'Customs', color: '93C5FD' },
    { label: 'Packaging', color: '86EFAC' },
    { label: 'Marketing', color: 'FDE68A' },
  ];
  let y = 2.4;
  layers.forEach((l, i) => {
    slide.addShape(pptx.ShapeType.rect, {
      x: 1.2 + i * 0.25,
      y,
      w: 9.3 - i * 0.5,
      h: 0.48,
      fill: { color: l.color },
      line: { color: COLORS.white, width: 1 },
    });
    slide.addText(l.label, {
      x: 1.4 + i * 0.25,
      y: y + 0.08,
      w: 2.0,
      h: 0.3,
      fontFace: FONT.body,
      fontSize: 11,
      color: COLORS.charcoal,
    });
    y += 0.5;
  });

  slide.addText('Landed cost determines profit.', {
    x: 1.2,
    y: 5.5,
    w: 10.6,
    h: 0.6,
    fontFace: FONT.body,
    fontSize: 18,
    bold: true,
    color: COLORS.charcoal,
  });
}

// Slide 8 — Sourcing, Branding & Quality
{
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.slate };
  addLogo(slide);
  addTitle(slide, 'Step 4: Sourcing, Branding & Quality', { size: 32 });
  addSubtitle(slide, 'Three things that protect your money', { y: 1.6 });

  const rows = [
    { title: 'Supplier verification and samples', icon: '🔎' },
    { title: 'Strong packaging and clear brand identity', icon: '🎁' },
    { title: 'Quality inspection before shipment', icon: '✅' },
  ];

  let y = 2.5;
  rows.forEach((r) => {
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 1.0,
      y,
      w: 11.2,
      h: 0.7,
      rx: 0.08,
      ry: 0.08,
      fill: { color: COLORS.white },
      line: { color: COLORS.border, width: 1 },
    });
    slide.addText(r.icon, { x: 1.2, y: y + 0.12, w: 0.4, h: 0.4, fontSize: 14 });
    slide.addText(r.title, {
      x: 1.7,
      y: y + 0.16,
      w: 10.0,
      h: 0.4,
      fontFace: FONT.body,
      fontSize: 14,
      color: COLORS.charcoal,
    });
    y += 0.85;
  });

  addFooter(slide, 'Price without quality control is expensive later.');
}

// Slide 9 — The Smart Shortcut
{
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.slate };
  addLogo(slide);
  addTitle(slide, 'The Smart Shortcut', { size: 32 });
  addSubtitle(slide, 'Introduce: LineScout', { y: 1.6 });

  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.8,
    y: 2.1,
    w: 5.6,
    h: 3.8,
    rx: 0.12,
    ry: 0.12,
    fill: { color: COLORS.white },
    line: { color: COLORS.border, width: 1 },
  });
  slide.addText('Problem', {
    x: 1.1,
    y: 2.3,
    w: 2.0,
    h: 0.3,
    fontFace: FONT.body,
    fontSize: 13,
    bold: true,
    color: COLORS.gray,
  });
  slide.addText('Guessing products\nHidden costs\nSupplier uncertainty', {
    x: 1.1,
    y: 2.7,
    w: 2.6,
    h: 1.4,
    fontFace: FONT.body,
    fontSize: 13,
    color: COLORS.charcoal,
  });
  slide.addText('Solution', {
    x: 3.6,
    y: 2.3,
    w: 2.0,
    h: 0.3,
    fontFace: FONT.body,
    fontSize: 13,
    bold: true,
    color: COLORS.gray,
  });
  slide.addText('Proven ideas\nCost clarity\nGuided sourcing', {
    x: 3.6,
    y: 2.7,
    w: 2.6,
    h: 1.4,
    fontFace: FONT.body,
    fontSize: 13,
    color: COLORS.charcoal,
  });

  slide.addShape(pptx.ShapeType.roundRect, {
    x: 7.1,
    y: 2.1,
    w: 5.2,
    h: 3.8,
    rx: 0.12,
    ry: 0.12,
    fill: { color: COLORS.white },
    line: { color: COLORS.border, width: 1 },
  });
  slide.addImage({ path: LINE_SCOUT_SCREEN, x: 7.3, y: 2.3, w: 4.8, h: 3.4, sizing: { type: 'cover', x: 7.3, y: 2.3, w: 4.8, h: 3.4 } });
}

// Slide 10 — Call To Action
{
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.slate };
  addLogo(slide);
  addTitle(slide, 'How To Start Today', { size: 32 });
  addSubtitle(slide, 'Your next step', { y: 1.6 });

  const steps = ['Explore', 'Compare', 'Start Project'];
  let x = 1.4;
  steps.forEach((s, i) => {
    slide.addShape(pptx.ShapeType.ellipse, {
      x,
      y: 3.0,
      w: 1.1,
      h: 1.1,
      fill: { color: COLORS.blue },
      line: { color: COLORS.blue },
    });
    slide.addText(String(i + 1), {
      x: x + 0.32,
      y: 3.14,
      w: 0.5,
      h: 0.5,
      fontFace: FONT.body,
      fontSize: 16,
      color: COLORS.white,
      bold: true,
      align: 'center',
    });
    slide.addText(s, {
      x: x - 0.2,
      y: 4.15,
      w: 1.6,
      h: 0.4,
      fontFace: FONT.body,
      fontSize: 14,
      color: COLORS.charcoal,
      align: 'center',
    });
    if (i < steps.length - 1) {
      slide.addShape(pptx.ShapeType.line, {
        x: x + 1.2,
        y: 3.55,
        w: 1.1,
        h: 0,
        line: { color: COLORS.grayLight, width: 1 },
      });
    }
    x += 2.4;
  });

  slide.addShape(pptx.ShapeType.roundRect, {
    x: 1.2,
    y: 5.3,
    w: 10.8,
    h: 0.75,
    rx: 0.08,
    ry: 0.08,
    fill: { color: COLORS.white },
    line: { color: COLORS.border, width: 1 },
  });
  slide.addText('Start with clarity. Build a brand, not just a shipment.', {
    x: 1.4,
    y: 5.45,
    w: 10.4,
    h: 0.5,
    fontFace: FONT.body,
    fontSize: 16,
    color: COLORS.blue,
    bold: true,
    align: 'center',
  });

  addFooter(slide, 'linescout.sureimports.com/white-label  |  WhatsApp channel');
}

pptx.writeFile({ fileName: 'white-label-webinar.pptx' });
