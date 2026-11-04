import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validatePublisherEnvironment as validate} from './publisher-environment.mjs';
test('owner exact-main publisher policy retains independent approval',()=>{
 const protection={protection_rules:[{type:'required_reviewers',prevent_self_review:true,reviewers:[{type:'User'}]}],deployment_branch_policy:{protected_branches:false,custom_branch_policies:true}};
 const main=[{type:'branch',name:'main'}];
 assert.doesNotThrow(()=>validate(protection,main));
 for(const policies of [[],[{type:'branch',name:'*'}],[{type:'tag',name:'main'}],[...main,{type:'branch',name:'development'}]])assert.throws(()=>validate(protection,policies));
 assert.throws(()=>validate({...protection,protection_rules:[]},main));
 assert.throws(()=>validate({...protection,protection_rules:[{type:'required_reviewers',prevent_self_review:false,reviewers:[{}]}]},main));
 assert.doesNotThrow(()=>validate({...protection,deployment_branch_policy:{protected_branches:true,custom_branch_policies:false}}));
});
