// Read-only approval-policy validation; naming an environment is insufficient.
export function validatePublisherEnvironment(protection,policies) {
 if(!protection?.protection_rules?.some(r=>r.type==='required_reviewers'&&r.prevent_self_review===true&&r.reviewers?.length>0))throw Error('Separate protected-environment approval required');
 const rule=protection.deployment_branch_policy;
 if(rule?.protected_branches===true&&rule.custom_branch_policies===false)return;
 if(rule?.custom_branch_policies===true&&rule.protected_branches===false&&Array.isArray(policies)&&policies.length===1&&policies[0].type==='branch'&&policies[0].name==='main')return;
 throw Error('Protected branches or exact main-only environment policy required');
}
