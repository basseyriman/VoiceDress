const fs = require('fs');
let code = fs.readFileSync('src/components/wardrobe/outfit-stage.tsx', 'utf8');

const newBlock = `
        const apparelPieces = lookPieces.filter(p => !finishQueue.some(f => f.id === p.id));
        
        // 1. EXTREME SPEED SINGLE PASS for Apparel
        if (apparelPieces.length > 0) {
          setDonePieceIds([]);
          setProgress(10);
          setStepLabel(\`Dressing you completely...\`);
          setActivePieceId(null);

          const allRes = await authFetch("/api/tryon/render", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: ac.signal,
            body: JSON.stringify({
              personImage: current,
              stage: "all",
              garments: apparelPieces.map(toPayload),
            }),
          });

          const allData = await readJsonResponse(allRes);
          if (cancelled || myId !== requestId.current || ac.signal.aborted) return;
          if (failOrBilling(allData, allRes.status)) return;

          if (!allData.ok || !allData.imageUrl) {
            setError(typeof allData.error === "string" ? allData.error : "Couldn't complete extreme-speed dressing.");
            setDressing(false);
            return;
          }

          current = allData.imageUrl as string;
          
          try {
            current = await lockFaceIdentity(identityPhoto, current, "strong", user?.avatarFaceBox);
          } catch (e) {
            console.warn("Face locking failed", e);
          }
          
          setWornUrl(current);
          setKeyConfigured(true);

          if (allData.consumedFreeTryOn) {
            consumedFreeThisRun = true;
            updateUser({
              freePhotoTryOnsUsed: Math.max(1, (user?.freePhotoTryOnsUsed || 0) + 1),
            });
          }

          const stepIds = new Set(Array.isArray(allData.steps) ? allData.steps.map((s: { id?: string }) => s.id).filter(Boolean) : []);
          for (const piece of apparelPieces) {
            if (stepIds.has(piece.id) || stepIds.size === 0) {
              markApplied({ id: piece.id, name: piece.name });
              setDonePieceIds((ids) => ids.includes(piece.id) ? ids : [...ids, piece.id]);
            } else {
              setMissingIds((ids) => ids.includes(piece.id) ? ids : [...ids, piece.id]);
            }
          }
        }

        // 2. ONE-SHOT BATCH for Accessories (Shoes, Watch, Glasses)
        if (finishQueue.length > 0) {
          setProgress(70);
          setStepLabel(\`Adding exact accessories...\`);
          
          const finishRes = await authFetch("/api/tryon/render", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: ac.signal,
            body: JSON.stringify({
              personImage: current,
              stage: "finish",
              includeFaceAccessories: true,
              garments: finishQueue.map(toPayload),
            }),
          });

          const finishData = await readJsonResponse(finishRes);
          if (cancelled || myId !== requestId.current || ac.signal.aborted) return;
          if (failOrBilling(finishData, finishRes.status)) return;

          if (finishData.ok && finishData.imageUrl) {
            current = finishData.imageUrl as string;
            
            try {
              const hasEyewear = finishQueue.some(p => /glass|frame|optic|sunglass|spec/i.test(p.name + p.category));
              current = await lockFaceIdentity(identityPhoto, current, hasEyewear ? "soft" : "strong", user?.avatarFaceBox);
            } catch (e) {
              console.warn("Face locking failed for accessories", e);
            }
            
            setWornUrl(current);
            
            for (const piece of finishQueue) {
              markApplied({ id: piece.id, name: piece.name });
              setDonePieceIds((ids) => ids.includes(piece.id) ? ids : [...ids, piece.id]);
            }
          } else {
            // Accessory batch failed
            console.warn("Accessory batch failed", finishData);
            for (const piece of finishQueue) {
              setMissingIds((ids) => ids.includes(piece.id) ? ids : [...ids, piece.id]);
            }
          }
        }
`;

const startIndex = code.indexOf('// EXTREME SPEED SINGLE PASS: Apply ALL pieces in one FASHN call');
const endIndex = code.indexOf('const missed = lookPieces.filter(');

if (startIndex === -1 || endIndex === -1) {
  console.log("Could not find boundaries.");
} else {
  const newCode = code.slice(0, startIndex) + newBlock + code.slice(endIndex);
  fs.writeFileSync('src/components/wardrobe/outfit-stage.tsx', newCode);
  console.log('Done!');
}
