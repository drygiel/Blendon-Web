// schema.org data for the landing, written into the prerendered page as JSON-LD.
import { FAQ } from '../landing/data/content.ts';
import { PRICE_USD, RELEASED, STORE_URL, VERSION } from './product.ts';

/** The product and the FAQ, with every link absolute against the deployed `siteUrl`. */
export function structuredData(siteUrl: string): object[] {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'Blendon',
      description:
        'Blender-style Scene view navigation, transform gizmos, typed values mid-drag and pie menus for the Unity Editor.',
      applicationCategory: 'DeveloperApplication',
      applicationSubCategory: 'Unity Editor extension',
      operatingSystem: 'Windows, macOS, Linux',
      softwareRequirements: 'Unity 6000.0 or newer',
      softwareVersion: VERSION,
      datePublished: RELEASED,
      url: siteUrl,
      image: new URL('og.jpg', siteUrl).href,
      publisher: { '@type': 'Organization', name: 'VeraCorp' },
      offers: {
        '@type': 'Offer',
        price: PRICE_USD.toFixed(2),
        priceCurrency: 'USD',
        availability: 'https://schema.org/InStock',
        url: new URL(STORE_URL, siteUrl).href,
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: FAQ.map(({ q, a }) => ({
        '@type': 'Question',
        name: q,
        acceptedAnswer: { '@type': 'Answer', text: a },
      })),
    },
  ];
}
