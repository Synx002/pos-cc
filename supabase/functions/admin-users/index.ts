// @ts-nocheck — File ini berjalan di Deno (Edge Function), bukan Node.js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DOMAIN = '@selasarkafe.com';

/** Pastikan username berbentuk email valid */
function toEmail(username: string): string {
  const u = username.trim();
  return u.includes('@') ? u : u + DOMAIN;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Tidak ada token autentikasi');

    // Client biasa untuk verifikasi bahwa caller adalah owner
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) throw new Error('Tidak terautentikasi');

    const { data: callerProfile } = await supabaseClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (callerProfile?.role !== 'owner') {
      throw new Error('Hanya owner yang dapat melakukan aksi ini');
    }

    // Admin client dengan service role key (bypass RLS)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const body = await req.json();
    const { action } = body;

    // ── CREATE ────────────────────────────────────────────────────────────────
    if (action === 'create') {
      const { user_name, password, role } = body;
      if (!user_name?.trim() || !password || !role) {
        throw new Error('Username, password, dan role wajib diisi');
      }
      if (password.length < 6) {
        throw new Error('Password minimal 6 karakter');
      }

      const email = toEmail(user_name);

      // Cek apakah username sudah ada di profiles
      const { data: existing } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('user_name', email)
        .maybeSingle();
      if (existing) throw new Error(`Username "${email}" sudah digunakan`);

      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (createError) throw createError;

      // Gunakan upsert agar tidak konflik jika trigger DB sudah auto-create profil
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .upsert({
          id: newUser.user.id,
          user_name: email,
          role,
          status: true,
        }, { onConflict: 'id' });

      if (profileError) {
        // Rollback: hapus auth user jika upsert profil gagal
        await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
        throw profileError;
      }

      return new Response(JSON.stringify({ success: true, user_id: newUser.user.id, email }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── UPDATE ────────────────────────────────────────────────────────────────
    if (action === 'update') {
      const { user_id, user_name, password, role } = body;
      if (!user_id) throw new Error('user_id diperlukan');

      const authUpdate: Record<string, any> = {};
      let newEmail: string | undefined;

      if (user_name !== undefined && user_name.trim()) {
        newEmail = toEmail(user_name);
        authUpdate.email = newEmail;
        authUpdate.email_confirm = true;
      }
      if (password?.trim()) {
        authUpdate.password = password.trim();
      }

      if (Object.keys(authUpdate).length > 0) {
        const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(user_id, authUpdate);
        if (authError) throw authError;
      }

      const profileUpdate: Record<string, any> = {};
      if (newEmail !== undefined) profileUpdate.user_name = newEmail;
      if (role !== undefined) profileUpdate.role = role;

      if (Object.keys(profileUpdate).length > 0) {
        const { error: profileError } = await supabaseAdmin
          .from('profiles')
          .update(profileUpdate)
          .eq('id', user_id);
        if (profileError) throw profileError;
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── DELETE ────────────────────────────────────────────────────────────────
    if (action === 'delete') {
      const { user_id } = body;
      if (!user_id) throw new Error('user_id diperlukan');

      await supabaseAdmin.from('profiles').delete().eq('id', user_id);

      const { error: delError } = await supabaseAdmin.auth.admin.deleteUser(user_id);
      if (delError) throw delError;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    throw new Error('Aksi tidak dikenal: ' + action);
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
