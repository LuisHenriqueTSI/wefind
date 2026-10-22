import { supabase } from '../lib/supabase';

export const createReport = async ({ itemId, reporterId, reason, details = '' }) => {
  if (!itemId || !reporterId || !reason) {
    throw new Error('Publicação, usuário e motivo são obrigatórios.');
  }

  const { data: existingReport, error: existingError } = await supabase
    .from('reports')
    .select('id')
    .eq('item_id', itemId)
    .eq('reporter_id', reporterId)
    .eq('status', 'pending')
    .maybeSingle();

  if (existingError) throw existingError;
  if (existingReport) {
    throw new Error('Você já denunciou esta publicação.');
  }

  const { data, error } = await supabase
    .from('reports')
    .insert({
      item_id: itemId,
      reporter_id: reporterId,
      reason,
      details: details.trim() || null,
      status: 'pending',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const listPendingReports = async () => {
  const { data, error } = await supabase
    .from('reports')
    .select(`
      *,
      items!item_id(id, title, status, city, state),
      reporter:profiles!reporter_id(name)
    `)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
};

export const resolveReport = async (reportId, adminId, resolution = 'reviewed') => {
  const { data, error } = await supabase
    .from('reports')
    .update({
      status: 'resolved',
      resolution,
      reviewed_by: adminId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', reportId)
    .select()
    .single();

  if (error) throw error;
  return data;
};