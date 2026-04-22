import { Outlet } from 'react-router'

import ImageAuth from '@/assets/images/image-auth.webp'
import Logo from '@/assets/images/logo.png'

export default function AuthLayout() {
  return (
    <div className="grid min-h-svh bg-white lg:grid-cols-2">
      <div className="flex flex-col gap-6 px-6 py-8 md:px-12">
        <div className="flex justify-center md:justify-start">
          <a href="#" className="flex items-center">
            <img src={Logo} alt="eBio" className="h-9 w-auto" />
          </a>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm">
            <Outlet />
          </div>
        </div>
      </div>
      <div className="relative hidden bg-[#f0f7f2] lg:flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_70%,rgba(30,122,55,0.08),transparent_60%),radial-gradient(circle_at_80%_20%,rgba(51,82,137,0.06),transparent_50%)]" />
        <img
          src={ImageAuth}
          alt="Produits biologiques"
          className="relative object-cover drop-shadow-lg"
          width={500}
          height={400}
        />
      </div>
    </div>
  )
}
