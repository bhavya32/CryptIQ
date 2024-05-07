import {sequence} from "@sveltejs/kit/hooks";
import * as Sentry from "@sentry/sveltekit";
import { adminAuth, adminDB } from "$lib/server/admin";
import { FieldValue } from "firebase-admin/firestore";
import type { Handle } from "@sveltejs/kit";

Sentry.init({
    dsn: "https://1cc82d6ffb226c1f6844700851ccb2a4@o951814.ingest.us.sentry.io/4507190125199360",
    tracesSampleRate: 1
})

let createdUserDataIndex = new Map<string, string>();
let indexLoaded = false;
const indexRef = adminDB.collection("index").doc('userIndex');
export const handle = sequence(Sentry.sentryHandle(), (async ({ event, resolve }) => {
    const sessionCookie = event.cookies.get("__session");
    if (!indexLoaded) {
        const doc = await indexRef.get();
        if (doc.exists) {
            const data = doc.data();
            if (data !== undefined) {
                createdUserDataIndex = new Map<string, string>(Object.entries(data));
            }
        }
        indexRef.onSnapshot((snap)=>{
            const snapData = snap.data();
            if(snapData!== undefined) createdUserDataIndex = new Map<string,string>(Object.entries(snapData));
        });
        indexLoaded = true;
    }

    try {
        if (sessionCookie === undefined) {
            event.locals.userID = null;
            event.locals.userExists = false;
            event.locals.userTeam = null;
            return resolve(event);
        }
        const decodedClaims = await adminAuth.verifySessionCookie(sessionCookie!);
        event.locals.userID = decodedClaims.uid;
        if (createdUserDataIndex.has(event.locals.userID)) {
            event.locals.userExists = true;
            event.locals.userTeam = createdUserDataIndex.get(event.locals.userID);
            return resolve(event);
        } else {
            const docRef = adminDB.collection('users').doc(event.locals.userID);
            const doc = await docRef.get();
            if (doc.exists) {
                const data = doc.data();
                const team = data?.team;
                createdUserDataIndex.set(event.locals.userID, team);
                event.locals.userExists = true;
                event.locals.userTeam = team;
            } else {
                event.locals.userExists = false;
                event.locals.userTeam = null;
            }
            return resolve(event);
        }
    } catch (e) {
        console.error(e);
        event.locals.userID = null;
        event.locals.userExists = false;
        event.locals.userTeam = null;
        return resolve(event);
    }
}) satisfies Handle);
export const handleError = Sentry.handleErrorWithSentry();