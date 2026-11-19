import fs from "node:fs";
const file=process.argv[2];
if(!file) throw Error("Missing test path");
let code=fs.readFileSync(file,"utf8");
function once(before,after,label){
  const i=code.indexOf(before);
  if(i<0||code.indexOf(before,i+1)>=0)throw Error("Unexpected v3 test source: "+label);
  code=code.slice(0,i)+after+code.slice(i+before.length);
}
once(
  '  for (const path of ["checkout", "donat/create"]) {\n    const direct = await system.api(1, path, { ...form, ...terms, expectedStars: 88 });\n    assert.deepEqual([direct.status, direct.data.error], [400, "invalid_payment_method"]);\n  }',
  '  const direct = await system.api(1, "donat/create", { ...form, ...terms, expectedStars: 88 });\n  assert.deepEqual([direct.status, direct.data.error], [400, "invalid_payment_method"]);',
  "DONAT still disallows direct Stars");
once(
  '[config.starsRate, config.orderStarsRate, config.termsUrl], [160, 0, termsUrl]',
  '[config.starsRate, config.orderStarsRate, config.termsUrl], [160, 160, termsUrl]',
  "BOOST Stars uses server rate");
fs.writeFileSync(file,code);
