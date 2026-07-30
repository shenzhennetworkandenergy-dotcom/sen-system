import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";

import { MobileNavigation } from "@/components/layout/MobileNavigation";
import { ProfileAvatar } from "@/components/profile/ProfileAvatar";
import { ProductSearch } from "@/components/catalog/ProductSearch";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { siteConfig } from "@/config/site";
import { getCurrentProfile } from "@/lib/auth/session";
import { dashboardPathForRole, routes } from "@/lib/constants/routes";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  FloatingChat,
  type FloatingConversation,
} from "@/components/support/FloatingChat";

export async function PublicHeader() {
  await connection();
  const { user, profile } = await getCurrentProfile();
  const dash = user ? dashboardPathForRole(profile?.role) : null;
  const label =
    profile?.role === "admin"
      ? "Admin Dashboard"
      : profile?.role === "employee"
        ? "Employee Dashboard"
        : "Customer Dashboard";
  let cartCount = 0;
  let avatarUrl: string | null = null;
  let floatingConversation: FloatingConversation = null;
  if (profile) {
    const db = createSupabaseAdminClient();
    if (profile.avatar_path) {
      const signedAvatar = await db.storage
        .from("profile-avatars")
        .createSignedUrl(profile.avatar_path, 3600);
      avatarUrl = signedAvatar.data?.signedUrl ?? null;
    }
    const [{ data: cart }, { data: conversation }] = await Promise.all([
      db
        .from("shopping_carts")
        .select("id")
        .eq("profile_id", profile.id)
        .eq("status", "active")
        .maybeSingle(),
      db
        .from("support_conversations")
        .select("id,subject,status")
        .eq("profile_id", profile.id)
        .order("last_message_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (cart) {
      const { data: items } = await db
        .from("shopping_cart_items")
        .select("quantity")
        .eq("cart_id", cart.id);
      cartCount = (items ?? []).reduce(
        (total, item) => total + Number(item.quantity),
        0,
      );
    }
    if (conversation) {
      const { data: messages } = await db
        .from("support_messages")
        .select("id,body,created_at,sender_profile_id,support_attachments(id,original_file_name,mime_type)")
        .eq("conversation_id", conversation.id)
        .order("created_at", { ascending: false })
        .limit(20);
      floatingConversation = {
        ...conversation,
        messages: (messages ?? []).reverse().map((message) => ({
          id: message.id,
          body: message.body,
          created_at: message.created_at,
          is_customer: message.sender_profile_id === profile.id,
          attachments: message.support_attachments ?? [],
        })),
      };
    }
  }

  return (
    <>
    <header className="sen-header sticky top-0 z-40">
      <div className="sen-announcement">
        <Container className="flex items-center justify-between gap-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] sm:text-xs">
          <span>Enterprise technology · Energy · Medical · Global sourcing</span>
          <span className="hidden text-cyan-300 md:inline">
            China → Bangladesh → Worldwide
          </span>
        </Container>
      </div>
      <Container className="flex min-h-20 items-center justify-between gap-5 py-2">
        <Link
          href={routes.home}
          className="sen-brand-link shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          aria-label={`${siteConfig.company.fullName} home`}
        >
          <span className="sen-brand-mark">
            <Image
              src={siteConfig.brandAsset.logo}
              alt={siteConfig.company.logoAlt}
              width={160}
              height={160}
              className="h-full w-full object-contain"
              priority
            />
          </span>
          <span className="hidden sm:block">
            <strong>SEN</strong>
            <small>Shenzhen Energy &amp; Networks</small>
          </span>
        </Link>
        <nav className="hidden lg:block" aria-label="Public navigation">
          <ul className="flex items-center gap-7 text-sm font-semibold">
            {siteConfig.navigation.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="sen-nav-link">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <ProductSearch compact className="hidden w-full max-w-xs xl:block" />
        <div className="hidden items-center gap-3 lg:flex">
          {dash ? (
            <>
              {profile?.role === "customer" ? <Link href="/request-quote/general" className="sen-nav-link">Request a Quote</Link> : null}
              <Link href={routes.cart} className={`sen-cart-link ${cartCount > 0 ? "has-items" : ""}`}>
                Cart {cartCount > 0 ? <span>{cartCount}</span> : null}
              </Link>
              <Link href={dash} className="sen-nav-link">
                {label}
              </Link>
              <Link href={routes.profile} className="sen-nav-link flex items-center gap-2">
                <ProfileAvatar
                  imageUrl={avatarUrl}
                  emoji={profile?.avatar_emoji}
                  name={profile?.full_name}
                  size={28}
                  className="ring-1 ring-white/30"
                />
                <span>My Profile</span>
              </Link>
              <a href={routes.logout} className="sen-nav-link">
                Logout
              </a>
            </>
          ) : (
            <>
              <Link href={routes.login} className="sen-nav-link">
                Login
              </Link>
              <Button
                href={routes.register}
                variant="secondary"
                size="sm"
                className="sen-button-secondary"
              >
                Create account
              </Button>
              <Button
                href={siteConfig.publicCtas.requestQuote.href}
                size="sm"
                className="sen-button-glow"
              >
                Request a Quote
              </Button>
            </>
          )}
        </div>
        <MobileNavigation
          isAuthenticated={Boolean(user)}
          dashboardHref={dash ?? undefined}
          dashboardLabel={label}
          cartCount={cartCount}
        />
      </Container>
      <Container className="pb-3 lg:hidden">
        <ProductSearch compact />
      </Container>
    </header>
    <FloatingChat
      authenticated={Boolean(user)}
      conversation={floatingConversation}
    />
    </>
  );
}
