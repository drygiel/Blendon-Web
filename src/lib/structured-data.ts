// schema.org data for the landing, written into the prerendered page as JSON-LD.
import { FAQ } from '../landing/data/content.ts';
import { RELEASED, VERSION } from './product.ts';

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
