import BrandFooter from '@/components/BrandFooter';
import FooterNewsletterForm from '@/components/FooterNewsletterForm';

export default function Footer() {
  return <BrandFooter home="https://www.sureimports.com" mainSite="https://www.sureimports.com" logo="https://www.sureimports.com/images/svg-logo-white.svg" newsletter={<FooterNewsletterForm />} />;
}
