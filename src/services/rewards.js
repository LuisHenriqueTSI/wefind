import { supabase } from '../lib/supabase';

export const createReward = async (rewardData) => {
  try {
    console.log('[createReward] Criando nova recompensa...');

    const { data, error } = await supabase
      .from('rewards')
      .insert({
        item_id: rewardData.item_id,
        owner_id: rewardData.owner_id,
        amount: rewardData.amount,
        currency: 'BRL',
        description: rewardData.description,
        status: 'active',
        expires_at: rewardData.expires_at,
      })
      .select()
      .single();

    if (error) {
      console.log('[createReward] Erro:', error.message);
      throw error;
    }

    console.log('[createReward] Recompensa criada com sucesso');
    return data;
  } catch (error) {
    console.log('[createReward] Exceção:', error.message);
    throw error;
  }
};

export const getRewardByItemId = async (itemId) => {
  try {
    const { data, error } = await supabase
      .from('rewards')
      .select('*')
      .eq('item_id', itemId);

    if (error) {
      console.log('[getRewardByItemId] Erro:', error.message);
      return [];
    }

    return data || [];
  } catch (error) {
    console.log('[getRewardByItemId] Exceção:', error.message);
    return [];
  }
};

export const updateReward = async (rewardId, updates) => {
  try {
    console.log('[updateReward] Atualizando recompensa:', rewardId);

    const { data, error } = await supabase
      .from('rewards')
      .update(updates)
      .eq('id', rewardId)
      .select()
      .single();

    if (error) {
      console.log('[updateReward] Erro:', error.message);
      throw error;
    }

    console.log('[updateReward] Recompensa atualizada com sucesso');
    return data;
  } catch (error) {
    console.log('[updateReward] Exceção:', error.message);
    throw error;
  }
};

export const createRewardClaim = async (claimData) => {
  try {
    console.log('[createRewardClaim] Criando reivindicação de recompensa...');

    const { data, error } = await supabase
      .from('reward_claims')
      .insert({
        reward_id: claimData.reward_id,
        claimer_id: claimData.claimer_id,
        message: claimData.message,
        evidence_notes: claimData.evidence_notes,
        status: 'pending',
      })
      .select()
      .single();

    if (error) {
      console.log('[createRewardClaim] Erro:', error.message);
      throw error;
    }

    console.log('[createRewardClaim] Reivindicação criada com sucesso');
    return data;
  } catch (error) {
    console.log('[createRewardClaim] Exceção:', error.message);
    throw error;
  }
};

export const getRewardClaims = async (rewardId) => {
  try {
    const { data, error } = await supabase
      .from('reward_claims')
      .select(`
        *,
        profiles(id, name, avatar_url)
      `)
      .eq('reward_id', rewardId)
      .order('created_at', { ascending: false });

    if (error) {
      console.log('[getRewardClaims] Erro:', error.message);
      return [];
    }

    return data || [];
  } catch (error) {
    console.log('[getRewardClaims] Exceção:', error.message);
    return [];
  }
};

export const approveRewardClaim = async (claimId, reviewedBy) => {
  try {
    console.log('[approveRewardClaim] Aprovando reivindicação:', claimId);

    const { data, error } = await supabase
      .from('reward_claims')
      .update({
        status: 'approved',
        reviewed_at: new Date().toISOString(),
        reviewed_by: reviewedBy,
      })
      .eq('id', claimId)
      .select()
      .single();

    if (error) {
      console.log('[approveRewardClaim] Erro:', error.message);
      throw error;
    }

    // Update reward status
    const claim = data;
    await updateReward(claim.reward_id, {
      status: 'claimed',
      claimed_at: new Date().toISOString(),
      claimed_by: claim.claimer_id,
    });

    console.log('[approveRewardClaim] Reivindicação aprovada com sucesso');
    return data;
  } catch (error) {
    console.log('[approveRewardClaim] Exceção:', error.message);
    throw error;
  }
};

export const rejectRewardClaim = async (claimId, reviewedBy) => {
  try {
    console.log('[rejectRewardClaim] Rejeitando reivindicação:', claimId);

    const { data, error } = await supabase
      .from('reward_claims')
      .update({
        status: 'rejected',
        reviewed_at: new Date().toISOString(),
        reviewed_by: reviewedBy,
      })
      .eq('id', claimId)
      .select()
      .single();

    if (error) {
      console.log('[rejectRewardClaim] Erro:', error.message);
      throw error;
    }

    console.log('[rejectRewardClaim] Reivindicação rejeitada com sucesso');
    return data;
  } catch (error) {
    console.log('[rejectRewardClaim] Exceção:', error.message);
    throw error;
  }
};

export const getUserRewards = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('rewards')
      .select(`
        *,
        items(id, title, status),
        profiles(id, name)
      `)
      .eq('owner_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.log('[getUserRewards] Erro:', error.message);
      return [];
    }

    return data || [];
  } catch (error) {
    console.log('[getUserRewards] Exceção:', error.message);
    return [];
  }
};
