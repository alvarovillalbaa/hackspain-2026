# Next.js Optimization Guide

Performance optimization techniques for Next.js applications — rendering strategies, image optimization, code splitting, data fetching, caching, bundle optimization, and Core Web Vitals.

---

## Rendering Strategies

### Static vs Dynamic

```tsx
// Force static generation at build time
export const dynamic = 'force-static';

// Force dynamic rendering at request time
export const dynamic = 'force-dynamic';

// Revalidate every 60 seconds (ISR)
export const revalidate = 60;

// On-demand revalidation
import { revalidatePath, revalidateTag } from 'next/cache';

async function updateProduct(id: string, data: ProductData) {
  await db.products.update({ where: { id }, data });
  revalidatePath(`/products/${id}`);
  revalidateTag('products');
}
```

### Streaming with Suspense

```tsx
async function ProductPage({ params }: { params: { id: string } }) {
  const product = await getProduct(params.id);
  return (
    <div>
      <h1>{product.name}</h1>
      <Suspense fallback={<ReviewsSkeleton />}>
        <Reviews productId={params.id} />
      </Suspense>
      <Suspense fallback={<RecommendationsSkeleton />}>
        <Recommendations productId={params.id} />
      </Suspense>
    </div>
  );
}
```

---

## Image Optimization

```tsx
import Image from 'next/image';

// Above the fold — load immediately
<Image src="/hero.jpg" alt="Hero" width={1200} height={600} priority />

// Responsive fill with aspect-ratio container
<div className="relative aspect-video">
  <Image
    src="/product.jpg"
    alt="Product"
    fill
    sizes="(max-width: 768px) 100vw, 50vw"
    className="object-cover"
  />
</div>

// With placeholder blur (local import)
import productImage from '@/public/product.jpg';
<Image src={productImage} alt="Product" placeholder="blur" />
```

```js
// next.config.js
module.exports = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn.example.com', pathname: '/images/**' },
      { protocol: 'https', hostname: '*.cloudinary.com' },
    ],
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
  },
};
```

---

## Code Splitting

### Dynamic Imports

```tsx
import dynamic from 'next/dynamic';

// With loading skeleton
const HeavyChart = dynamic(() => import('@/components/HeavyChart'), {
  loading: () => <ChartSkeleton />,
});

// Disable SSR for browser-only components
const MapComponent = dynamic(() => import('@/components/Map'), {
  ssr: false,
  loading: () => <div className="h-[400px] bg-gray-100" />,
});

// Named exports
const Modal = dynamic(() => import('@/components/ui').then(mod => mod.Modal));
```

### Parallel Routes for Isolated Loading

```
app/dashboard/
├── @analytics/page.tsx   # Loaded in parallel
├── @metrics/page.tsx     # Loaded in parallel
└── layout.tsx
```

```tsx
export default function DashboardLayout({ children, analytics, metrics }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {children}
      <Suspense fallback={<AnalyticsSkeleton />}>{analytics}</Suspense>
      <Suspense fallback={<MetricsSkeleton />}>{metrics}</Suspense>
    </div>
  );
}
```

---

## Data Fetching

### Parallel Fetching

```tsx
async function Dashboard() {
  const [user, stats, notifications] = await Promise.all([
    getUser(), getStats(), getNotifications(),
  ]);
  return <div>...</div>;
}
```

### Request Memoization

Next.js automatically deduplicates identical `fetch` calls within a single render pass — multiple components calling `getUser()` result in one network request.

---

## Caching

### Fetch Cache Options

```tsx
// Cache indefinitely (default for static)
fetch('https://api.example.com/data');

// No cache
fetch('https://api.example.com/data', { cache: 'no-store' });

// Revalidate after time
fetch('https://api.example.com/data', { next: { revalidate: 3600 } });

// Tag-based revalidation
fetch('https://api.example.com/products', { next: { tags: ['products'] } });
revalidateTag('products'); // invalidate all tagged fetches
```

### unstable_cache for Custom Caching

```tsx
import { unstable_cache } from 'next/cache';

const getCachedUser = unstable_cache(
  async (userId: string) => db.users.findUnique({ where: { id: userId } }),
  ['user-cache'],
  { revalidate: 3600, tags: ['users'] }
);
```

---

## Bundle Optimization

### Analyze Bundle Size

```bash
npm install @next/bundle-analyzer

# next.config.js
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});
module.exports = withBundleAnalyzer({ /* config */ });

ANALYZE=true npm run build
```

### Tree Shaking

```tsx
// BAD - imports entire lodash
import _ from 'lodash';

// GOOD - named imports (tree-shakeable)
import { debounce } from 'lodash-es';
```

### Next.js Bundle Config

```js
module.exports = {
  transpilePackages: ['ui-library', 'shared-utils'],
  experimental: {
    optimizePackageImports: ['lucide-react', '@heroicons/react'],
  },
  serverExternalPackages: ['sharp', 'bcrypt'],
};
```

### Font Optimization

```tsx
import { Inter, Roboto_Mono } from 'next/font/google';

const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });
const robotoMono = Roboto_Mono({ subsets: ['latin'], display: 'swap', variable: '--font-roboto-mono' });

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${inter.variable} ${robotoMono.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
```

---

## Core Web Vitals

### LCP — Largest Contentful Paint

```tsx
// Priority image for LCP element
<Image src="/hero.jpg" alt="Hero" fill priority sizes="100vw" className="object-cover" />

// Preload critical resources
export default function RootLayout({ children }) {
  return (
    <html>
      <head>
        <link rel="preload" href="/hero.jpg" as="image" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

### CLS — Cumulative Layout Shift

```tsx
// Always provide explicit dimensions to avoid layout shifts
<Image src="/product.jpg" alt="Product" width={400} height={300} />

// Or use aspect-ratio containers
<div className="aspect-video relative">
  <Image src="/video-thumb.jpg" alt="Video" fill />
</div>

// Skeleton placeholders prevent layout shifts
function ProductCard({ product }: { product?: Product }) {
  if (!product) {
    return (
      <div className="animate-pulse">
        <div className="h-48 bg-gray-200 rounded" />
        <div className="h-4 bg-gray-200 rounded mt-2 w-3/4" />
      </div>
    );
  }
  return <div>...</div>;
}
```

### INP — Interaction to Next Paint

```tsx
import Script from 'next/script';

export default function Layout({ children }) {
  return (
    <html>
      <body>
        {children}
        {/* Load analytics after page is interactive */}
        <Script src="https://analytics.example.com/script.js" strategy="afterInteractive" />
        {/* Load chat widget when idle */}
        <Script src="https://chat.example.com/widget.js" strategy="lazyOnload" />
      </body>
    </html>
  );
}
```

### Measuring Performance

```tsx
'use client';
import { useReportWebVitals } from 'next/web-vitals';

export function PerformanceMonitor() {
  useReportWebVitals((metric) => {
    analytics.track('web-vital', {
      name: metric.name,
      value: metric.value,
      id: metric.id,
    });
  });
  return null;
}
```

---

## Performance Checklist

| Area | Optimization | Impact |
|------|-------------|--------|
| Images | `next/image` with `priority` for LCP element | High |
| Fonts | `next/font` with `display: swap` | Medium |
| Code | Dynamic imports for heavy components | High |
| Data | `Promise.all` for parallel fetching | High |
| Render | Server Components by default | High |
| Cache | Tag-based revalidation for shared data | Medium |
| Bundle | Tree-shake imports, `optimizePackageImports` | Medium |
