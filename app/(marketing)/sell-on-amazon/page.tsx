import type { Metadata } from 'next';
import Link from 'next/link';
import { Search, Calculator, PackageCheck, ShieldCheck, Store, TrendingUp } from 'lucide-react';
import styles from './AmazonGuide.module.css';

const title = 'Source in China. Sell on Amazon.';
const description = 'A practical guide to researching, sourcing and white labelling products from China for Amazon sellers in the UK, Canada and United States.';
export const metadata: Metadata = {
  title: `${title} | LineScout by Sure Imports`, description,
  alternates: { canonical: 'https://linescout.sureimports.com/sell-on-amazon' },
  openGraph: { title, description, url: 'https://linescout.sureimports.com/sell-on-amazon', images: ['/amazon-guide/01-markets.png'] },
  twitter: { card: 'summary_large_image', title, description, images: ['/amazon-guide/01-markets.png'] },
};

const steps = [
  { icon: Search, title: 'Find an idea. Validate the opportunity.', body: 'Explore LineScout’s product ideas and estimated landed costs. Then research your chosen Amazon marketplace: competing prices, reviews, demand, seasonality and the reasons a customer would choose your offer.', check: 'Before moving on: identify a clear point of difference. A popular product can also be an overcrowded market.' },
  { icon: Calculator, title: 'Work out the margin before you order.', body: 'Build a per-unit cost sheet covering the product, branding, inspection, freight, import costs, Amazon fees, storage, advertising and returns. Check what is already included in your landed-cost estimate so you do not count it twice.', check: 'Before moving on: test a lower selling price, higher advertising costs and a slower sales rate. Keep working capital for reorders.' },
  { icon: PackageCheck, title: 'Confirm the supplier, sample and specification.', body: 'Share your product brief with Sure Imports through LineScout. Discuss supplier options, minimum quantities, branding, packaging and samples. Agree the final specification, quotation and inspection scope before committing to production.', check: 'Before moving on: approve the sample and written specification. A sample is a check, not a guarantee that every production unit will match.' },
  { icon: ShieldCheck, title: 'Check eligibility before shipment.', body: 'Confirm that your account can sell the product and category. Check applicable safety, labelling, testing, intellectual-property and import requirements for the destination. Obtain the relevant documentation before placing a bulk order.', check: 'Before moving on: resolve product restrictions and documentation gaps. A supplier’s claim of compliance is not a substitute for checking the evidence.' },
  { icon: Store, title: 'Prepare your listing and fulfilment plan.', body: 'Create your Amazon seller account and an accurate listing with clear photographs, dimensions, materials and product features. Confirm any required product identifier or eligible exemption. Choose your own fulfilment or Amazon FBA, and verify current preparation and receiving requirements.', check: 'Before moving on: agree where the shipment will go. Delivery to an Amazon facility, labelling and preparation must be specifically confirmed in your sourcing arrangement.' },
  { icon: TrendingUp, title: 'Launch carefully. Learn before scaling.', body: 'Start with an order size you can responsibly fund. Track contribution per sale, advertising spend, returns, stock age and reorder lead times. Improve the product and listing from genuine feedback; never buy reviews or offer incentives for positive reviews.', check: 'Before moving on: reorder based on actual results, not revenue alone. There is no guaranteed product, sales volume or profit.' },
];
const markets = [
  { id: 'uk', flag: '🇬🇧', name: 'United Kingdom', store: 'Amazon.co.uk · GBP', body: 'Plan your costs in GBP. Check UK import arrangements, applicable VAT and product-specific requirements. Confirm whether you will store stock yourself, with a fulfilment provider or with Amazon.', href: 'https://sell.amazon.co.uk/how-to-start-selling-on-amazon', compliance: 'https://sell.amazon.co.uk/selling-partner-compliance-hub' },
  { id: 'canada', flag: '🇨🇦', name: 'Canada', store: 'Amazon.ca · CAD', body: 'Plan your costs in CAD. Check Canadian import, tax, product and applicable language or labelling requirements. Do not assume that documentation or packaging prepared for the US automatically meets Canadian requirements.', href: 'https://sell.amazon.ca/resource-guide', compliance: 'https://sell.amazon.ca/sell-online' },
  { id: 'us', flag: '🇺🇸', name: 'United States', store: 'Amazon.com · USD', body: 'Plan your costs in USD. Confirm the importer-of-record arrangement, applicable duties and product-specific rules. Check selling eligibility and fulfilment requirements before paying for a bulk shipment.', href: 'https://sell.amazon.com/sell', compliance: 'https://sell.amazon.com/learn/faq' },
];

export default function AmazonGuide() {
  return <main className={styles.page}>
    <header className={styles.hero}>
      <span className={styles.eyebrow}>THE CHINA-TO-AMAZON GUIDE</span>
      <h1>Source in China.<br />Sell on Amazon.</h1>
      <p>From your first product idea to a better-informed launch. Understand the sourcing, costs and decisions behind selling on Amazon in the UK, Canada and the US.</p>
      <div className={styles.actions}><Link className={styles.primary} href="/white-label">Explore product ideas</Link><a className={styles.secondary} href="#the-process">Understand the process</a><Link className={styles.secondary} href="/sell-on-tiktok-shop">TikTok Shop selling guide</Link></div>
      <nav className={styles.marketLinks} aria-label="Choose your Amazon marketplace">{markets.map(m => <a key={m.id} href={`#market-${m.id}`}><span aria-hidden="true">{m.flag}</span>{m.name}</a>)}</nav>
      <small>Independent guidance from Sure Imports and LineScout. Not affiliated with Amazon.</small>
    </header>
    <div className={styles.container}>
      <section className={styles.intro} aria-labelledby="white-label-heading">
        <div><span className={styles.eyebrow}>A PRODUCT. YOUR BRAND.</span><h2 id="white-label-heading">You don’t need a factory.<br />You need a well-researched plan.</h2></div>
        <div><p>White labelling means selling a manufacturer’s existing product under your own brand, where branding is available and permitted. Private labelling can involve a more customised product or specification. Neither automatically gives you an exclusive product.</p><p>LineScout brings together researched product ideas and estimated landed costs. Sure Imports helps with the sourcing and shipping discussed in your quotation. Your Amazon account, listing, compliance and selling decisions remain your responsibility.</p></div>
      </section>
      <section id="the-process" className={styles.section}>
        <span className={styles.eyebrow}>SIX DECISIONS THAT MATTER</span><h2>A practical route from idea to launch.</h2><p className={styles.lead}>Start with evidence. Commit to stock only when the product, costs and requirements make sense.</p>
        <div className={styles.steps}>{steps.map((s,i)=><article key={s.title}><div className={styles.stepTop}><s.icon size={24} aria-hidden="true"/><span>0{i+1}</span></div><h3>{s.title}</h3><p>{s.body}</p><p className={styles.check}>{s.check}</p></article>)}</div>
      </section>
      <section className={styles.economics} id="understand-costs">
        <div><span className={styles.eyebrow}>THE NUMBERS BEFORE THE ORDER</span><h2>A £25 sale is not £25 earned.</h2><p>Look beyond the factory price. This simplified example shows how the amount remaining can shrink once the costs of selling are included.</p><Link className={styles.primary} href="/amazon-profit-calculator">Calculate your potential margin</Link><a className={styles.secondary} href="https://sell.amazon.com/pricing/estimate" target="_blank" rel="noopener noreferrer">Use Amazon’s revenue calculator</a></div>
        <div className={styles.costs}><h3>Illustrative cost per unit</h3><dl>{[['Selling price','£25.00'],['Product and branding','− £6.00'],['Freight and import costs','− £3.00'],['Amazon selling and fulfilment fees','− £7.00'],['Advertising','− £3.00'],['Returns allowance','− £1.00'],['Remaining contribution','£5.00']].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><p>Illustration only, not a quotation or Amazon fee schedule. This is not net profit: other overheads and applicable taxes may reduce the £5 remaining. Your tax position and the treatment of recoverable taxes matter. Avoid double-counting costs already in your landed estimate.</p></div>
      </section>
      <section className={styles.section} id="markets"><span className={styles.eyebrow}>ONE JOURNEY. DIFFERENT REQUIREMENTS.</span><h2>Start with the market you’ll sell in.</h2><p className={styles.lead}>A destination is more than a currency. Check the current rules for your product and business before ordering.</p><div className={styles.markets}>{markets.map(m=><article id={`market-${m.id}`} key={m.id}><span className={styles.flag} aria-hidden="true">{m.flag}</span><h3>{m.name}</h3><strong>{m.store}</strong><p>{m.body}</p><a href={m.href} target="_blank" rel="noopener noreferrer">Amazon seller guide</a><a href={m.compliance} target="_blank" rel="noopener noreferrer">Requirements and guidance</a></article>)}</div><p className={styles.note}>This is general education, not legal or tax advice. Use the relevant authorities and qualified advisers for your circumstances. Requirements and fees change; check Amazon’s current guidance before committing funds.</p></section>
      <section className={styles.section}><span className={styles.eyebrow}>KNOW WHO DOES WHAT</span><h2>Support with sourcing. Ownership of your business.</h2><div className={styles.markets}>{[
        ['LineScout','Explore product ideas, compare available cost estimates, prepare your brief and discuss sourcing requirements. Product ideas are starting points, not guaranteed opportunities.'],
        ['Sure Imports','Discuss supplier sourcing, samples, branding, inspection and shipping. The services, destination, deliverables and charges included in your order are confirmed in your quotation.'],
        ['You, the seller','Own your Amazon account, validate demand, confirm selling eligibility and compliance, create your listing, manage your budget and fulfil your responsibilities to customers.'],
      ].map(([heading,body])=><article key={heading}><h3>{heading}</h3><p>{body}</p></article>)}</div></section>
      <section className={styles.section}><span className={styles.eyebrow}>BEFORE YOU BEGIN</span><h2>Questions worth asking.</h2><div className={styles.faq}>{[
        ['Are these products guaranteed to sell on Amazon?','No. A researched idea and an estimated landed cost do not establish demand, profitability or Amazon approval. Validate the opportunity in your chosen marketplace.'],
        ['Can I use my own logo and packaging?','Often, but it depends on the supplier, product, order quantity and your rights to the branding. Request the options and costs, and approve samples before production.'],
        ['Can you ship directly to Amazon?','Discuss this before ordering. Warehouse delivery, labels, packaging and the shipment plan must be specifically agreed. Standard shipping is not a promise of Amazon-compliant preparation or acceptance.'],
        ['How much money do I need to start?','There is no universal figure. Budget for samples, stock, preparation, shipping, import costs, selling fees, advertising and a reserve. Minimum order quantities and the product you choose will shape the amount.'],
        ['Do you run my Amazon store?','This guide does not include store management, Amazon account approval or a sales guarantee. Confirm any additional service separately before purchasing.'],
      ].map(([q,a])=><details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div></section>
      <section className={styles.closing}><span className={styles.eyebrow}>YOUR NEXT STEP</span><h2>Choose an idea worth investigating.</h2><p>Explore the products, understand the costs, then tell us what you want to source.</p><div className={styles.actions}><Link className={styles.primary} href="/white-label">Explore product ideas</Link><Link className={styles.secondary} href="/white-label/start">Build your sourcing brief</Link></div></section>
    </div>
  </main>;
}
