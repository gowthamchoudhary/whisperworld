# Requirements Document

## Introduction

WhisperWorld is a full-stack web application that allows users to photograph any living thing in nature and engage in a real-time voice conversation with that creature. The app uses Google Gemini Vision API to identify the subject, ElevenLabs Voice Design API to generate a unique personality and voice, and ElevenLabs Conversational AI to power the live dialogue. Creatures remember users across sessions via Supabase. When multiple creatures appear in a single photo, a group conversation mode is triggered. Users may also ask creatures to sing using ElevenLabs TTS v3.

## Glossary

- **Vision_Engine**: The backend service responsible for submitting user photos to the Google Gemini Vision API and parsing the identification response.
- **Character_Engine**: The backend service responsible for generating a unique personality profile and voice for each identified creature using ElevenLabs Voice Design API.
- **Conversation_Agent**: The ElevenLabs Conversational AI agent configured per creature, responsible for managing real-time voice dialogue.
- **Memory_Store**: The Supabase database layer that persists creature profiles and user-creature interaction history across sessions.
- **Group_Conversation_Manager**: The backend service that orchestrates multi-creature conversations when more than one creature is detected in a photo.
- **Song_Engine**: The backend service that uses ElevenLabs TTS v3 to generate sung audio responses on user request.
- **Ambient_Sound_Engine**: The frontend service responsible for fetching and playing background nature sounds via the ElevenLabs Sound Effects API during active voice sessions.
- **Location_Service**: The backend service responsible for resolving GPS coordinates to a known Creature_Profile within a defined proximity radius.
- **Personality_Archetype**: A predefined set of personality traits and speaking style descriptors mapped to a creature category by the Character_Engine.
- **User**: A person using the WhisperWorld web application.
- **Creature**: A living thing in nature identified from a user-submitted photo (e.g., flower, ant, tree, squirrel).
- **Creature_Profile**: A persisted record containing a creature's species, personality traits, voice configuration, GPS coordinates, and conversation history.
- **Session**: A single continuous interaction between a User and one or more Creatures.

---

## Requirements

### Requirement 1: Photo Capture and Submission

**User Story:** As a User, I want to take or upload a photo of a living thing in nature, so that the app can identify it and begin a conversation.

#### Acceptance Criteria

1. THE Frontend SHALL provide a camera capture interface that allows the User to take a photo directly from their device camera.
2. THE Frontend SHALL provide a file upload interface that allows the User to select an existing photo from their device.
3. WHEN a photo is submitted, THE Frontend SHALL send the image to the backend as a multipart form upload.
4. IF the submitted file is not an image format (JPEG, PNG, WebP, or HEIC), THEN THE Frontend SHALL display an error message and reject the upload.
5. IF the submitted image exceeds 10 MB in size, THEN THE Frontend SHALL display an error message and reject the upload.
6. WHILE a photo is being uploaded, THE Frontend SHALL display a loading indicator to the User.

---

### Requirement 2: Creature Identification via Vision Engine

**User Story:** As a User, I want the app to identify the living thing in my photo, so that I know what creature I am about to speak with.

#### Acceptance Criteria

1. WHEN a photo is received by the backend, THE Vision_Engine SHALL submit the image to the Google Gemini Vision API for identification.
2. WHEN the Gemini Vision API returns a response, THE Vision_Engine SHALL extract the species name, common name, and count of distinct living subjects from the response.
3. WHEN exactly one living subject is identified, THE Vision_Engine SHALL return a single Creature identification result to the caller.
4. WHEN two or more living subjects are identified, THE Vision_Engine SHALL return a list of Creature identification results to the caller.
5. IF the Gemini Vision API returns no identifiable living subject, THEN THE Vision_Engine SHALL return an error response with the message "No living creature detected in this photo."
6. IF the Gemini Vision API call fails or times out after 10 seconds, THEN THE Vision_Engine SHALL return an error response indicating the identification service is unavailable.
7. THE Vision_Engine SHALL include a confidence score between 0.0 and 1.0 for each identified Creature in the response.

---

### Requirement 3: Creature Profile Generation via Character Engine

**User Story:** As a User, I want each creature to have a unique personality and voice, so that every conversation feels distinct and immersive.

#### Acceptance Criteria

1. WHEN a Creature identification result is received, THE Character_Engine SHALL generate a personality profile containing at minimum: a name, three personality traits, a backstory of no more than 100 words, and a speaking style descriptor.
2. WHEN generating a personality profile, THE Character_Engine SHALL use the species, common name, and natural habitat of the Creature as inputs to the Gemini API prompt.
3. WHEN a personality profile is generated, THE Character_Engine SHALL call the ElevenLabs Voice Design API to create a unique voice matching the personality and species of the Creature.
4. WHEN the ElevenLabs Voice Design API returns a voice ID, THE Character_Engine SHALL store the voice ID in the Creature_Profile.
5. IF a Creature_Profile already exists in the Memory_Store for the same species and User, THEN THE Character_Engine SHALL load the existing profile instead of generating a new one.
6. IF the ElevenLabs Voice Design API call fails, THEN THE Character_Engine SHALL fall back to a pre-configured default voice ID and log the failure.
7. THE Character_Engine SHALL persist the generated Creature_Profile to the Memory_Store before returning it to the caller.

---

### Requirement 4: Real-Time Voice Conversation

**User Story:** As a User, I want to have a real-time voice conversation with the identified creature, so that I can interact with it naturally.

#### Acceptance Criteria

1. WHEN a Creature_Profile is ready, THE Conversation_Agent SHALL be initialized with the creature's personality profile, backstory, and voice ID.
2. WHEN the Conversation_Agent is initialized, THE Frontend SHALL establish a WebSocket connection to begin the real-time voice session.
3. WHILE a voice session is active, THE Conversation_Agent SHALL respond to User speech using the creature's assigned voice and personality.
4. WHILE a voice session is active, THE Frontend SHALL display a visual indicator showing whether the Creature or the User is currently speaking.
5. WHEN the User ends the session, THE Conversation_Agent SHALL save the conversation transcript to the Memory_Store.
6. IF the WebSocket connection is interrupted, THEN THE Frontend SHALL attempt to reconnect up to 3 times before displaying a connection error to the User.
7. THE Conversation_Agent SHALL respond to each User utterance within 3 seconds under normal network conditions.

---

### Requirement 5: Cross-Session Memory

**User Story:** As a User, I want the creature to remember me across sessions, so that our relationship feels continuous and personal.

#### Acceptance Criteria

1. WHEN a User returns to a Creature they have spoken with before, THE Memory_Store SHALL provide the Conversation_Agent with the previous conversation summary and any stored User preferences.
2. THE Memory_Store SHALL store a summary of each completed Session, including the date, duration, and key topics discussed.
3. WHEN a Creature_Profile is loaded from the Memory_Store, THE Character_Engine SHALL inject the conversation history summary into the Conversation_Agent's system prompt.
4. THE Memory_Store SHALL associate each Creature_Profile with a User identifier to ensure memory is User-specific.
5. IF no prior session exists for a User-Creature pair, THEN THE Conversation_Agent SHALL begin the conversation as a first meeting.
6. THE Memory_Store SHALL retain Creature_Profile data and session summaries for a minimum of 90 days from the last interaction.

---

### Requirement 6: Group Conversation Mode

**User Story:** As a User, I want to have a conversation with multiple creatures at once when my photo contains more than one, so that I can experience a richer, more dynamic interaction.

#### Acceptance Criteria

1. WHEN the Vision_Engine identifies two or more Creatures in a single photo, THE Group_Conversation_Manager SHALL initialize a Creature_Profile for each identified Creature.
2. WHEN Group Conversation Mode is active, THE Group_Conversation_Manager SHALL route User speech to all active Conversation_Agents.
3. WHEN multiple Conversation_Agents generate responses simultaneously, THE Group_Conversation_Manager SHALL queue the responses and play them sequentially to avoid audio overlap.
4. WHILE Group Conversation Mode is active, THE Frontend SHALL display the name and a visual avatar for each participating Creature.
5. WHILE Group Conversation Mode is active, THE Frontend SHALL highlight the Creature that is currently speaking.
6. IF one Creature_Profile fails to initialize during Group Conversation Mode, THEN THE Group_Conversation_Manager SHALL proceed with the remaining successfully initialized Creatures and notify the User of the failure.
7. THE Group_Conversation_Manager SHALL support a maximum of 5 simultaneous Creatures in a single Group Conversation session.

---

### Requirement 7: Creature Singing

**User Story:** As a User, I want to ask a creature to sing, so that I can enjoy a unique musical performance in the creature's voice.

#### Acceptance Criteria

1. WHEN the User requests a song during an active voice session, THE Conversation_Agent SHALL detect the singing intent and pass the request to the Song_Engine.
2. WHEN the Song_Engine receives a singing request, THE Song_Engine SHALL generate a short song (between 15 and 60 seconds) using ElevenLabs TTS v3 in the creature's assigned voice.
3. WHEN the Song_Engine generates a song, THE Song_Engine SHALL use lyrics thematically related to the creature's species, habitat, and personality.
4. WHEN the song audio is ready, THE Frontend SHALL play the audio to the User without interrupting the active voice session state.
5. IF the ElevenLabs TTS v3 call fails, THEN THE Song_Engine SHALL return an error to the Conversation_Agent, which SHALL inform the User that the creature is unable to sing at this time.
6. THE Song_Engine SHALL return the generated audio within 10 seconds of receiving the singing request.

---

### Requirement 8: User Authentication and Identity

**User Story:** As a User, I want to have a persistent identity in the app, so that my creature memories are saved and associated with me.

#### Acceptance Criteria

1. THE Frontend SHALL provide a sign-up flow allowing Users to register with an email address and password.
2. THE Frontend SHALL provide a sign-in flow allowing registered Users to authenticate with their email address and password.
3. WHEN a User authenticates, THE Memory_Store SHALL associate all subsequent Creature_Profile records and session summaries with that User's identifier.
4. IF a User attempts to access a voice session without being authenticated, THEN THE Frontend SHALL redirect the User to the sign-in page.
5. WHEN a User signs out, THE Frontend SHALL terminate any active voice session and clear local session state.
6. THE Frontend SHALL support authentication via Supabase Auth, using JWT tokens for session management.

---

### Requirement 9: GPS-Based Creature Identity

**User Story:** As a User, I want the app to recognise a creature I have spoken with before when I return to the same location, so that I can continue my relationship with that specific individual.

#### Acceptance Criteria

1. WHEN a User submits a photo, THE Frontend SHALL capture the device GPS coordinates and include them in the submission payload.
2. WHEN a photo submission is received, THE Location_Service SHALL query the Memory_Store for any existing Creature_Profile of the same species whose stored GPS coordinates are within 50 metres of the submitted coordinates.
3. WHEN a matching Creature_Profile is found within the 50-metre radius, THE Character_Engine SHALL load the existing Creature_Profile instead of generating a new one.
4. WHEN no matching Creature_Profile is found within the 50-metre radius, THE Character_Engine SHALL generate a new Creature_Profile and store the submitted GPS coordinates in that profile.
5. IF the device does not provide GPS coordinates, THEN THE Location_Service SHALL skip the proximity check and THE Character_Engine SHALL fall back to species-and-User matching as defined in Requirement 3.
6. THE Memory_Store SHALL store GPS coordinates as a latitude/longitude pair with a precision of at least 5 decimal places in each Creature_Profile.

---

### Requirement 10: Ambient Sound Layer

**User Story:** As a User, I want to hear background nature sounds during my conversation, so that the experience feels immersive and contextually appropriate to the creature's habitat.

#### Acceptance Criteria

1. WHEN a Creature_Profile is loaded and a voice session is about to begin, THE Ambient_Sound_Engine SHALL request a background sound from the ElevenLabs Sound Effects API using a prompt derived from the creature's species and natural habitat.
2. WHEN the ElevenLabs Sound Effects API returns an audio asset, THE Ambient_Sound_Engine SHALL begin looping the audio at a volume level that does not interfere with the Conversation_Agent's voice output.
3. WHILE a voice session is active, THE Ambient_Sound_Engine SHALL continue playing the background sound loop.
4. WHEN the voice session ends, THE Ambient_Sound_Engine SHALL stop the background sound loop.
5. IF the ElevenLabs Sound Effects API call fails, THEN THE Ambient_Sound_Engine SHALL proceed without background sound and SHALL NOT block the voice session from starting.
6. THE Ambient_Sound_Engine SHALL use a distinct sound prompt per creature category (e.g., "forest floor ambience" for insects, "garden breeze" for flowers, "ancient woodland" for trees).

---

### Requirement 11: Free Tier Infrastructure Constraints

**User Story:** As a developer, I want the system to operate within free service tiers wherever possible, so that the application can be run at minimal cost.

#### Acceptance Criteria

1. THE Vision_Engine SHALL use only the Google Gemini Vision API free tier for all image identification requests.
2. THE Memory_Store SHALL use only the Supabase free tier for all database storage and authentication operations.
3. THE Frontend deployment SHALL use only the Vercel free tier for hosting and serverless function execution.
4. THE backend API deployment SHALL use only the Railway free tier for container hosting and execution.
5. THE Ambient_Sound_Engine, Song_Engine, Character_Engine, and Conversation_Agent SHALL use ElevenLabs paid API tiers, as ElevenLabs is the only service for which paid usage is permitted.
6. IF a free-tier usage limit is reached for any non-ElevenLabs service, THEN THE System SHALL return a service-unavailable error to the User rather than incurring paid usage on that service.

---

### Requirement 12: Mobile-First User Interface

**User Story:** As a User in a park taking photos on my phone, I want the entire interface to be designed for mobile use, so that I can interact comfortably with one hand in portrait orientation.

#### Acceptance Criteria

1. THE Frontend SHALL render all views in a single-column layout optimised for portrait orientation on screens with a minimum width of 320 px and a maximum width of 480 px.
2. THE Frontend SHALL size all interactive controls (buttons, inputs, toggles) to a minimum touch target of 44 × 44 CSS pixels.
3. THE Frontend SHALL NOT require horizontal scrolling on any view when rendered at 320 px viewport width.
4. WHEN the device orientation changes to landscape, THE Frontend SHALL display a prompt asking the User to rotate their device back to portrait orientation.
5. THE Frontend SHALL use system-native font sizes of at least 16 px for body text to prevent automatic zoom on input focus in iOS Safari.
6. THE Frontend SHALL achieve a Lighthouse mobile performance score of 80 or above on a simulated mid-range Android device.

---

### Requirement 13: Creature Personality Archetypes

**User Story:** As a User, I want each type of creature to have a recognisable personality style, so that conversations feel consistent and true to the creature's nature.

#### Acceptance Criteria

1. THE Character_Engine SHALL maintain a Personality_Archetype mapping that assigns a default set of personality traits and a speaking style descriptor to each of the following creature categories: Rose/Flower, Ant/Insect, Tree, Squirrel, Bird, Mushroom, and Default.
2. WHEN generating a Creature_Profile for a Rose or Flower species, THE Character_Engine SHALL apply the Personality_Archetype: warm, poetic, romantic.
3. WHEN generating a Creature_Profile for an Ant or Insect species, THE Character_Engine SHALL apply the Personality_Archetype: anxious, hardworking, fast-talking.
4. WHEN generating a Creature_Profile for a Tree species, THE Character_Engine SHALL apply the Personality_Archetype: ancient, wise, slow, philosophical.
5. WHEN generating a Creature_Profile for a Squirrel species, THE Character_Engine SHALL apply the Personality_Archetype: hyperactive, scattered, excitable.
6. WHEN generating a Creature_Profile for a Mushroom species, THE Character_Engine SHALL apply the Personality_Archetype: mysterious, cryptic, whispery.
7. WHEN generating a Creature_Profile for a Bird species, THE Character_Engine SHALL apply the Personality_Archetype: free-spirited, musical, observant.
8. WHEN generating a Creature_Profile for any species that does not match a defined category, THE Character_Engine SHALL apply the Default Personality_Archetype: curious, gentle, wondering.
9. THE Character_Engine SHALL use the assigned Personality_Archetype traits as the primary input when constructing the ElevenLabs Voice Design API prompt and the Conversation_Agent system prompt for that Creature.
