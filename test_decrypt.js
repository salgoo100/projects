const fs = require('fs');
const path = require('path');
const CryptoJS = require('crypto-js');

const filePath = path.join(__dirname, '조의금_정리_보고서_김상구.html');
const pwd = '7173';

try {
  const content = fs.readFileSync(filePath, 'utf-8');
  
  // Extract encryptedData from file
  const match = content.match(/const encryptedData = "([^"]+)"/);
  if (!match) {
    console.error("Could not find encryptedData in the HTML wrapper!");
    process.exit(1);
  }
  
  const encryptedData = match[1];
  console.log(`Found encryptedData length: ${encryptedData.length}`);
  
  const decrypted = CryptoJS.AES.decrypt(encryptedData, pwd);
  const rawText = decrypted.toString(CryptoJS.enc.Utf8);
  
  console.log(`Decrypted rawText length: ${rawText.length}`);
  
  if (rawText.length === 0) {
    console.log("Decryption failed: rawText is empty. Invalid password or corrupted cipher.");
  } else {
    console.log("Decrypted rawText snippet (first 100 chars):");
    console.log(JSON.stringify(rawText.slice(0, 100)));
    
    const isValid = rawText.startsWith('<!DOCTYPE') || rawText.startsWith('<html') || rawText.startsWith('<!doctype');
    console.log(`Is rawText valid start (Starts with DOCTYPE or html)? ${isValid}`);
  }

} catch (err) {
  console.error("Error during test decryption:", err);
}
