import styles from './OfficeLocations.module.css';

const offices = [
  { country: 'Nigeria', city: 'Lagos', company: 'Sure Importers Limited', address: '5 Olutosin Ajayi Street, Ajao Estate, Lagos, Nigeria.', phones: ['+234 803 764 9956', '+234 806 458 3664'] },
  { country: 'United Kingdom', city: 'Warrington', company: 'Spreadit Sourcing Limited', address: '33 Bevan Court, Dunlop Street, WA4 6AA, Warrington, England.', phones: ['+44 788 119 4138'] },
  { country: 'China', city: 'Guangzhou', company: '', address: 'Office 3FB3-1, Jianfa Plaza, 111 Airport Road, Baiyun District, Guangzhou, China.', localAddress: '广州市白云区机场路111号建发广场3FB3-1.', phones: [] },
];

export default function OfficeLocations() {
  return <div className={styles.offices} aria-label="Our locations">
    {offices.map(office => <section key={office.country}>
      <h3>{office.city}, {office.country}</h3>
      {office.company ? <p className={styles.company}>{office.company}</p> : null}
      <address>{office.address}{office.localAddress ? <span lang="zh">{office.localAddress}</span> : null}</address>
      {office.phones.length ? <div className={styles.phones}>{office.phones.map(phone => <a key={phone} href={`tel:${phone.replace(/\s/g, '')}`}>{phone}</a>)}</div> : null}
    </section>)}
  </div>;
}
