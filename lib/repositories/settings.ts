import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { SiteSettings } from "@/lib/db";

export type { SiteSettings } from "@/lib/db";

const DEFAULT: SiteSettings = {
  demoFormEnabled: true,
  demoBannerEnabled: false,
  demoBannerText: "",
  blogSectionEnabled: true,
  noticeBannerEnabled: false,
  noticeBannerText: "",
};

const sb = () => createSupabaseAdminClient();

export async function getSettings(): Promise<SiteSettings> {
  const { data, error } = await sb()
    .from("site_settings")
    .select("*")
    .eq("id", "default")
    .single();
  if (error || !data) return DEFAULT;
  return rowToLegacy(data);
}

export async function updateSettings(
  patch: Partial<SiteSettings>
): Promise<SiteSettings> {
  const update: Record<string, unknown> = {};
  if (patch.demoFormEnabled !== undefined)    update.demo_form_enabled        = patch.demoFormEnabled;
  if (patch.demoBannerEnabled !== undefined)  update.demo_banner_enabled      = patch.demoBannerEnabled;
  if (patch.demoBannerText !== undefined)     update.demo_banner_text         = patch.demoBannerText;
  if (patch.blogSectionEnabled !== undefined) update.blog_section_enabled     = patch.blogSectionEnabled;
  if (patch.noticeBannerEnabled !== undefined)update.notice_banner_enabled    = patch.noticeBannerEnabled;
  if (patch.noticeBannerText !== undefined)   update.notice_banner_text       = patch.noticeBannerText;
  if (patch.googleSheetWebhookUrl !== undefined) update.google_sheet_webhook_url = patch.googleSheetWebhookUrl;
  if (patch.leadWebhookUrl !== undefined)     update.lead_webhook_url         = patch.leadWebhookUrl;
  if (patch.channelTalkWebhookUrl !== undefined) update.channel_talk_webhook_url = patch.channelTalkWebhookUrl;
  if (patch.emailWebhookUrl !== undefined)    update.email_webhook_url        = patch.emailWebhookUrl;

  const { data, error } = await sb()
    .from("site_settings")
    .update(update)
    .eq("id", "default")
    .select()
    .single();
  if (error || !data) throw new Error(`[settings] 업데이트 실패: ${error?.message}`);
  return rowToLegacy(data);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToLegacy(row: any): SiteSettings {
  return {
    demoFormEnabled:        row.demo_form_enabled,
    demoBannerEnabled:      row.demo_banner_enabled,
    demoBannerText:         row.demo_banner_text ?? "",
    blogSectionEnabled:     row.blog_section_enabled,
    noticeBannerEnabled:    row.notice_banner_enabled,
    noticeBannerText:       row.notice_banner_text ?? "",
    googleSheetWebhookUrl:  row.google_sheet_webhook_url ?? undefined,
    leadWebhookUrl:         row.lead_webhook_url ?? undefined,
    channelTalkWebhookUrl:  row.channel_talk_webhook_url ?? undefined,
    emailWebhookUrl:        row.email_webhook_url ?? undefined,
  };
}
