import {test} from 'node:test';
import assert from 'node:assert/strict';
import {timelineToRenderProps} from '../src/remotion-adapter.ts';
import type {Timeline} from '../src/types.ts';
const make = (version?: 1|2): Timeline => ({id:'tl',runId:'r',fps:30,width:1080,height:1920,durationMs:1000,aspect:'9:16',markers:[],mix:{version,voice:0.8,music:0.2,sfx:0.6},createdAt:'',updatedAt:'',tracks:[{id:'t',timelineId:'tl',kind:'music',label:'BGM',ord:0,zIndex:0,muted:false,locked:false,visible:true,clips:[{id:'c',trackId:'t',assetId:null,startMs:0,durationMs:1000,inMs:0,transforms:{x:0,y:0,scale:1,rotation:0,opacity:1},effects:[],keyframes:[],locked:false,createdAt:'',updatedAt:''}]}]});
test('legacy clips keep pre-resolved mix gains; new v2 clips resolve once in renderer',()=>{
 assert.equal(timelineToRenderProps(make(),[]).clips[0].volume,0.2);
 assert.equal(timelineToRenderProps(make(2),[]).clips[0].volume,undefined);
});
test('hidden tracks do not render and native video track mute retains the picture',()=>{
 const tl=make();tl.tracks[0].visible=false;assert.equal(timelineToRenderProps(tl,[]).clips.length,0);
 tl.tracks[0].visible=true;tl.tracks[0].kind='video';tl.tracks[0].muted=true;
 assert.equal(timelineToRenderProps(tl,[]).clips[0].volume,0);
});
