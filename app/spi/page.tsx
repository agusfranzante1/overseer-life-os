import { redirect } from 'next/navigation'

/** /spi is now folded into /proyeccion's weekly tab. Old bookmarks and
 *  external links (e.g. the breadcrumb in calendar items) still land
 *  on the weekly SPI experience via this redirect. */
export default function SPI() {
  redirect('/proyeccion?level=week')
}
